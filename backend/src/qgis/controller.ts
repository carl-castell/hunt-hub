import { Request, Response } from 'express';
import { eq, sql, and } from 'drizzle-orm';
import { DOMParser, type Document as XmlDocument } from '@xmldom/xmldom';
import { db } from '@/db';
import { areasTable } from '@/db/schema/areas';
import { standsTable } from '@/db/schema/stands';
import { audit } from '@/services/audit';
import { logError } from '@/utils/logError';

const WFS_NS  = 'http://www.opengis.net/wfs';
const GML_NS  = 'http://www.opengis.net/gml';
const OWS_NS  = 'http://www.opengis.net/ows';

// ── Helpers ───────────────────────────────────────────────────────────────────

function exception(code: string, message: string, status = 400): { status: number; body: string } {
  return {
    status,
    body: `<?xml version="1.0" encoding="UTF-8"?>
<ows:ExceptionReport xmlns:ows="${OWS_NS}" version="1.1.0" language="en">
  <ows:Exception exceptionCode="${code}">
    <ows:ExceptionText>${escapeXml(message)}</ows:ExceptionText>
  </ows:Exception>
</ows:ExceptionReport>`,
  };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sendXml(res: Response, status: number, body: string) {
  res.status(status).type('text/xml').send(body);
}

function parseAreaId(typeName: string): number | null {
  const m = typeName.match(/^stands_(\d+)$/);
  return m ? Number(m[1]) : null;
}

function parseAreaPolygonId(typeName: string): number | null {
  const m = typeName.match(/^area_(\d+)$/);
  return m ? Number(m[1]) : null;
}

function stripNs(s: string): string {
  return s.includes(':') ? s.split(':').pop()! : s;
}

function getChildText(el: Element, localName: string): string | null {
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i] as Element;
    if (n.nodeType === 1 && n.localName === localName) {
      return n.textContent ?? null;
    }
  }
  return null;
}

function getChildElement(el: Element, localName: string): Element | null {
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i] as Element;
    if (n.nodeType === 1 && n.localName === localName) return n;
  }
  return null;
}

function getElementsByLocalName(el: Element | XmlDocument, localName: string): Element[] {
  const results: Element[] = [];
  function walk(node: Element | XmlDocument) {
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      const c = children[i] as Element;
      if (c.nodeType === 1) {
        if (c.localName === localName) results.push(c);
        walk(c);
      }
    }
  }
  walk(el);
  return results;
}

// Collect all (prefix → namespaceURI) pairs used anywhere in the subtree.
function gatherNamespaces(el: Element, ns: Map<string, string>) {
  if (el.namespaceURI) {
    const colon = el.tagName.indexOf(':');
    if (colon > 0) ns.set(el.tagName.slice(0, colon), el.namespaceURI);
  }
  for (let i = 0; i < el.childNodes.length; i++) {
    const c = el.childNodes[i] as Element;
    if (c.nodeType === 1) gatherNamespaces(c, ns);
  }
}

// Serialises a GML geometry element to a string for ST_GeomFromGML.
// Injects xmlns declarations on the root element so libxml2/PostGIS can parse
// namespace-prefixed elements whose declarations live on an ancestor node.
function serializeElement(el: Element): string {
  const nsDecls = new Map<string, string>();
  gatherNamespaces(el, nsDecls);

  function walk(node: Element, isRoot: boolean): string {
    let s = `<${node.tagName}`;
    const alreadyDeclared = new Set<string>();
    for (let i = 0; i < node.attributes.length; i++) {
      const a = node.attributes[i];
      s += ` ${a.name}="${escapeXml(a.value)}"`;
      if (a.name.startsWith('xmlns:')) alreadyDeclared.add(a.name.slice(6));
    }
    if (isRoot) {
      for (const [prefix, uri] of nsDecls) {
        if (!alreadyDeclared.has(prefix)) s += ` xmlns:${prefix}="${escapeXml(uri)}"`;
      }
    }
    s += '>';
    for (let i = 0; i < node.childNodes.length; i++) {
      const c = node.childNodes[i];
      if ((c as Element).nodeType === 1) s += walk(c as Element, false);
      else if (c.nodeType === 3) s += escapeXml(c.textContent ?? '');
    }
    s += `</${node.tagName}>`;
    return s;
  }

  return walk(el, true);
}

// Parse a ring container (exterior/outerBoundaryIs/interior/innerBoundaryIs)
// → WKT ring string like "(lon lat, lon lat, ...)" or null.
function gmlRingToWkt(container: Element): string | null {
  const lr = getChildElement(container, 'LinearRing');
  if (!lr) return null;
  const posListEl = getChildElement(lr, 'posList');
  if (!posListEl) return null;
  const nums = (posListEl.textContent ?? '').trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
  if (nums.length < 6 || nums.length % 2 !== 0) return null;
  const pts: string[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push(`${nums[i]} ${nums[i + 1]}`);
  return `(${pts.join(',')})`;
}

// Convert a GML polygon/multipolygon element to WKT so we can use
// ST_GeomFromText instead of ST_GeomFromGML. QGIS sends mixed GML 2/3
// (MultiPolygon + polygonMember containers with GML 3 posList coordinates)
// which some PostGIS versions reject in ST_GeomFromGML.
function gmlPolygonToWkt(geomEl: Element): string | null {
  const name = geomEl.localName;

  const parsePolygon = (polygonEl: Element): string | null => {
    const rings: string[] = [];
    for (let i = 0; i < polygonEl.childNodes.length; i++) {
      const child = polygonEl.childNodes[i] as Element;
      if (child.nodeType !== 1) continue;
      const ln = child.localName;
      if (ln === 'exterior' || ln === 'outerBoundaryIs' || ln === 'interior' || ln === 'innerBoundaryIs') {
        const ring = gmlRingToWkt(child);
        if (ring) rings.push(ring);
      }
    }
    return rings.length > 0 ? `(${rings.join(',')})` : null;
  };

  if (name === 'Polygon') {
    const poly = parsePolygon(geomEl);
    return poly ? `MULTIPOLYGON(${poly})` : null;
  }

  if (name === 'MultiPolygon' || name === 'MultiSurface' || name === 'GeometryCollection') {
    const wktPolygons: string[] = [];
    for (let i = 0; i < geomEl.childNodes.length; i++) {
      const member = geomEl.childNodes[i] as Element;
      if (member.nodeType !== 1) continue;
      const mln = member.localName;
      if (mln !== 'polygonMember' && mln !== 'surfaceMember' && mln !== 'geometryMember') continue;
      for (let j = 0; j < member.childNodes.length; j++) {
        const child = member.childNodes[j] as Element;
        if (child.nodeType !== 1 || child.localName !== 'Polygon') continue;
        const poly = parsePolygon(child);
        if (poly) wktPolygons.push(poly);
      }
    }
    return wktPolygons.length > 0 ? `MULTIPOLYGON(${wktPolygons.join(',')})` : null;
  }

  return null;
}

// ── GetCapabilities ───────────────────────────────────────────────────────────

export async function getCapabilities(req: Request, res: Response) {
  const estateId = req.wfsUser!.estateId;
  const token = req.query.token as string ?? '';
  const baseUrl = `${req.protocol || 'http'}://${req.get('host')}/wfs?token=${encodeURIComponent(token)}`;

  try {
    const areas = await db
      .select({ id: areasTable.id, name: areasTable.name })
      .from(areasTable)
      .where(eq(areasTable.estateId, estateId));

    const featureTypes = areas.map(a => `
    <FeatureType>
      <Name>area_${a.id}</Name>
      <Title>${escapeXml(a.name)}</Title>
      <DefaultSRS>EPSG:4326</DefaultSRS>
      <Operations>
        <Operation>Query</Operation>
        <Operation>Insert</Operation>
        <Operation>Update</Operation>
      </Operations>
    </FeatureType>
    <FeatureType>
      <Name>stands_${a.id}</Name>
      <Title>Stands – ${escapeXml(a.name)}</Title>
      <DefaultSRS>EPSG:4326</DefaultSRS>
      <Operations>
        <Operation>Query</Operation>
        <Operation>Insert</Operation>
        <Operation>Update</Operation>
        <Operation>Delete</Operation>
      </Operations>
    </FeatureType>`).join('');

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<WFS_Capabilities version="1.1.0"
  xmlns="http://www.opengis.net/wfs"
  xmlns:ows="${OWS_NS}"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.opengis.net/wfs http://schemas.opengis.net/wfs/1.1.0/wfs.xsd">
  <ows:ServiceIdentification>
    <ows:Title>Hunt Hub WFS</ows:Title>
    <ows:ServiceType>WFS</ows:ServiceType>
    <ows:ServiceTypeVersion>1.1.0</ows:ServiceTypeVersion>
  </ows:ServiceIdentification>
  <ows:OperationsMetadata>
    <ows:Operation name="GetCapabilities">
      <ows:DCP><ows:HTTP><ows:Get xlink:href="${escapeXml(baseUrl)}"/></ows:HTTP></ows:DCP>
    </ows:Operation>
    <ows:Operation name="DescribeFeatureType">
      <ows:DCP><ows:HTTP><ows:Get xlink:href="${escapeXml(baseUrl)}"/></ows:HTTP></ows:DCP>
    </ows:Operation>
    <ows:Operation name="GetFeature">
      <ows:DCP><ows:HTTP><ows:Get xlink:href="${escapeXml(baseUrl)}"/></ows:HTTP></ows:DCP>
    </ows:Operation>
    <ows:Operation name="Transaction">
      <ows:DCP><ows:HTTP><ows:Post xlink:href="${escapeXml(baseUrl)}"/></ows:HTTP></ows:DCP>
    </ows:Operation>
  </ows:OperationsMetadata>
  <FeatureTypeList>
    <Operations>
      <Operation>Query</Operation>
    </Operations>
    ${featureTypes}
  </FeatureTypeList>
</WFS_Capabilities>`;

    sendXml(res, 200, body);
  } catch (err) {
    logError('[wfs:GetCapabilities]', err);
    const e = exception('InternalError', 'Server error.', 500);
    sendXml(res, e.status, e.body);
  }
}

// ── DescribeFeatureType ───────────────────────────────────────────────────────

export function describeFeatureType(req: Request, res: Response) {
  const typeNames = qp(req, 'typeNames') || qp(req, 'typeName') || 'areas';

  const areasXsd = `
  <xs:complexType name="areasType">
    <xs:complexContent>
      <xs:extension base="gml:AbstractFeatureType">
        <xs:sequence>
          <xs:element name="name"    type="xs:string" minOccurs="0"/>
          <xs:element name="geofile" type="gml:MultiSurfacePropertyType" minOccurs="0"/>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>
  <xs:element name="areas" type="ms:areasType" substitutionGroup="gml:_Feature"/>`;

  const standsXsd = `
  <xs:complexType name="standsType">
    <xs:complexContent>
      <xs:extension base="gml:AbstractFeatureType">
        <xs:sequence>
          <xs:element name="number"             type="xs:string"/>
          <xs:element name="location"           type="gml:PointPropertyType" minOccurs="0"/>
          <xs:element name="force_outside_area" type="xs:integer" minOccurs="0"/>
        </xs:sequence>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>`;

  const types = typeNames.split(',').map(t => t.trim());
  let defs = '';
  for (const t of types) {
    if (t === 'areas' || parseAreaPolygonId(t) !== null)
      defs += areasXsd.replace(/name="areas"/g, `name="${escapeXml(t)}"`) + `\n  <xs:element name="${escapeXml(t)}" type="ms:areasType" substitutionGroup="gml:_Feature"/>`;
    else if (t.startsWith('stands_'))
      defs += standsXsd + `\n  <xs:element name="${escapeXml(t)}" type="ms:standsType" substitutionGroup="gml:_Feature"/>`;
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema
  xmlns:xs="http://www.w3.org/2001/XMLSchema"
  xmlns:gml="http://www.opengis.net/gml"
  xmlns:ms="http://mapserver.gis.umn.edu/mapserver"
  elementFormDefault="qualified"
  targetNamespace="http://mapserver.gis.umn.edu/mapserver">
  <xs:import namespace="http://www.opengis.net/gml"
    schemaLocation="http://schemas.opengis.net/gml/3.1.1/base/gml.xsd"/>
  ${defs}
</xs:schema>`;

  sendXml(res, 200, body);
}

// ── GetFeature ────────────────────────────────────────────────────────────────

export async function getFeature(req: Request, res: Response) {
  const estateId = req.wfsUser!.estateId;
  const typeNames = stripNs(qp(req, 'typeNames') || qp(req, 'typeName'));

  try {
    let members = '';

    const areaPolygonId = parseAreaPolygonId(typeNames);
    if (areaPolygonId !== null) {
      const [row] = await db
        .select({
          id: areasTable.id,
          name: areasTable.name,
          gml: sql<string | null>`ST_AsGML(3, geofile, 8, 17)`,
        })
        .from(areasTable)
        .where(and(eq(areasTable.id, areaPolygonId), eq(areasTable.estateId, estateId)))
        .limit(1);

      if (!row) {
        const e = exception('InvalidParameterValue', 'Area not found.', 404);
        return sendXml(res, e.status, e.body);
      }

      if (row.gml) {
        members = `
  <gml:featureMember>
    <ms:${escapeXml(typeNames)} gml:id="${escapeXml(typeNames)}.${row.id}" xmlns:ms="http://mapserver.gis.umn.edu/mapserver">
      <ms:name>${escapeXml(row.name)}</ms:name>
      <ms:geofile>${row.gml}</ms:geofile>
    </ms:${escapeXml(typeNames)}>
  </gml:featureMember>`;
      }
    } else {
      const areaId = parseAreaId(typeNames);
      if (areaId === null) {
        const e = exception('InvalidParameterValue', `Unknown typeNames: ${typeNames}`);
        return sendXml(res, e.status, e.body);
      }

      const [area] = await db
        .select({ id: areasTable.id })
        .from(areasTable)
        .where(and(eq(areasTable.id, areaId), eq(areasTable.estateId, estateId)))
        .limit(1);

      if (!area) {
        const e = exception('InvalidParameterValue', `Area not found.`, 404);
        return sendXml(res, e.status, e.body);
      }

      const rows = await db
        .select({
          id: standsTable.id,
          number: standsTable.number,
          gml: sql<string | null>`ST_AsGML(3, location, 8, 17)`,
        })
        .from(standsTable)
        .where(eq(standsTable.areaId, areaId));

      for (const row of rows) {
        members += `
  <gml:featureMember>
    <ms:${escapeXml(typeNames)} gml:id="${escapeXml(typeNames)}.${row.id}" xmlns:ms="http://mapserver.gis.umn.edu/mapserver">
      <ms:number>${escapeXml(row.number)}</ms:number>
      ${row.gml ? `<ms:location>${row.gml}</ms:location>` : ''}
      <ms:force_outside_area>0</ms:force_outside_area>
    </ms:${escapeXml(typeNames)}>
  </gml:featureMember>`;
      }
    }

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:FeatureCollection
  xmlns:wfs="${WFS_NS}"
  xmlns:gml="${GML_NS}"
  xmlns:ows="${OWS_NS}">
  ${members}
</wfs:FeatureCollection>`;

    sendXml(res, 200, body);
  } catch (err) {
    logError('[wfs:GetFeature]', err);
    const e = exception('InternalError', 'Server error.', 500);
    sendXml(res, e.status, e.body);
  }
}

// ── GET dispatcher ────────────────────────────────────────────────────────────

function qp(req: Request, name: string): string {
  return String(req.query[name] ?? req.query[name.toUpperCase()] ?? req.query[name.toLowerCase()] ?? '');
}

export async function wfsGet(req: Request, res: Response) {
  const request = qp(req, 'request');
  switch (request) {
    case 'GetCapabilities':     return getCapabilities(req, res);
    case 'DescribeFeatureType': return describeFeatureType(req, res);
    case 'GetFeature':          return getFeature(req, res);
    default: {
      const e = exception('OperationNotSupported', `Unsupported request: ${request}`);
      return sendXml(res, e.status, e.body);
    }
  }
}

// ── Transaction ───────────────────────────────────────────────────────────────

export async function wfsTransaction(req: Request, res: Response) {
  const { id: userId, estateId } = req.wfsUser!;
  const raw = req.body as string;

  let doc: XmlDocument;
  try {
    doc = new DOMParser().parseFromString(raw, 'text/xml') as XmlDocument;
  } catch {
    const e = exception('InvalidParameter', 'Could not parse XML body.');
    return sendXml(res, e.status, e.body);
  }

  const txEl = doc.documentElement;
  if (!txEl) {
    const e = exception('InvalidParameter', 'Could not parse XML body.');
    return sendXml(res, e.status, e.body);
  }
  const children: Element[] = [];
  for (let i = 0; i < txEl.childNodes.length; i++) {
    const c = txEl.childNodes[i] as unknown as Element;
    if (c.nodeType === 1) children.push(c);
  }

  let inserted = 0, updated = 0, deleted = 0;
  const insertedFeatures: { typeName: string; id: number }[] = [];

  try {
    for (const op of children) {
      switch (op.localName) {
        case 'Insert':  { const d = await handleInsert(op, estateId, userId, req.ip); inserted += d.count; insertedFeatures.push(...d.features); break; }
        case 'Update':  { const d = await handleUpdate(op, estateId, userId, req.ip); updated  += d; break; }
        case 'Delete':  { const d = await handleDelete(op, estateId, userId, req.ip); deleted  += d; break; }
        default: break;
      }
    }
  } catch (err) {
    if (err instanceof WfsException) {
      const e = exception(err.code, err.message);
      return sendXml(res, e.status, e.body);
    }
    logError('[wfs:Transaction]', err);
    const e = exception('InternalError', 'Server error.', 500);
    return sendXml(res, e.status, e.body);
  }

  const insertResults = insertedFeatures.length > 0
    ? `\n  <wfs:InsertResults>\n${insertedFeatures.map(f => `    <wfs:Feature><ogc:FeatureId fid="${escapeXml(f.typeName)}.${f.id}"/></wfs:Feature>`).join('\n')}\n  </wfs:InsertResults>`
    : '';

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:TransactionResponse xmlns:wfs="${WFS_NS}" xmlns:ogc="http://www.opengis.net/ogc" version="1.1.0">
  <wfs:TransactionSummary>
    <wfs:totalInserted>${inserted}</wfs:totalInserted>
    <wfs:totalUpdated>${updated}</wfs:totalUpdated>
    <wfs:totalDeleted>${deleted}</wfs:totalDeleted>
  </wfs:TransactionSummary>${insertResults}
</wfs:TransactionResponse>`;

  sendXml(res, 200, body);
}

class WfsException extends Error {
  constructor(public code: string, message: string) { super(message); }
}

// ── Insert ────────────────────────────────────────────────────────────────────

async function handleInsert(op: Element, estateId: number, userId: number, ip: string | undefined): Promise<{ count: number; features: { typeName: string; id: number }[] }> {
  let count = 0;
  const features: { typeName: string; id: number }[] = [];
  for (let i = 0; i < op.childNodes.length; i++) {
    const featureEl = op.childNodes[i] as Element;
    if (featureEl.nodeType !== 1) continue;
    const typeName = featureEl.localName;

    const areaPolygonId = parseAreaPolygonId(typeName);
    if (areaPolygonId !== null) {
      const [area] = await db
        .select({ id: areasTable.id, hasGeofile: sql<boolean>`geofile IS NOT NULL` })
        .from(areasTable)
        .where(and(eq(areasTable.id, areaPolygonId), eq(areasTable.estateId, estateId)))
        .limit(1);

      if (!area) throw new WfsException('InvalidParameter', 'Area not found.');
      if (area.hasGeofile) throw new WfsException('OperationNotSupported', 'Area boundary already exists. Use the editing tools to modify it.');

      const geofileEl = getChildElement(featureEl, 'geofile');
      const geomEl = geofileEl
        ? (getChildElement(geofileEl, 'MultiSurface') ?? getChildElement(geofileEl, 'MultiPolygon') ?? getChildElement(geofileEl, 'GeometryCollection') ?? getChildElement(geofileEl, 'Polygon'))
        : null;

      if (!geomEl) throw new WfsException('MissingParameter', 'Geometry is required.');

      const wkt = gmlPolygonToWkt(geomEl);
      if (!wkt) throw new WfsException('InvalidParameter', 'Could not parse geometry.');

      await db
        .update(areasTable)
        .set({ geofile: sql`ST_GeomFromText(${wkt}, 4326)` })
        .where(eq(areasTable.id, areaPolygonId));

      await audit({ userId, event: 'area_updated', ip, metadata: { areaId: areaPolygonId, source: 'wfs' } });
      features.push({ typeName, id: area.id });
      count++;
    } else {
      const areaId = parseAreaId(typeName);
      if (areaId === null) throw new WfsException('InvalidParameter', `Unknown feature type: ${typeName}`);

      const [area] = await db
        .select({ id: areasTable.id, name: areasTable.name, hasGeofile: sql<boolean>`geofile IS NOT NULL` })
        .from(areasTable)
        .where(and(eq(areasTable.id, areaId), eq(areasTable.estateId, estateId)))
        .limit(1);

      if (!area) throw new WfsException('InvalidParameter', 'Area not found.');

      const number = getChildText(featureEl, 'number');
      if (!number?.trim()) throw new WfsException('MissingParameter', 'Stand number is required.');

      const forceRaw = getChildText(featureEl, 'force_outside_area');
      const force = forceRaw === '1' || forceRaw === 'true';

      const locationEl = getChildElement(featureEl, 'location');
      const pointEl = locationEl ? getChildElement(locationEl, 'Point') : null;
      const pointGml = pointEl ? serializeElement(pointEl) : null;

      if (pointGml && !force && area.hasGeofile) {
        const [within] = await db
          .select({ ok: sql<boolean>`ST_Within(ST_GeomFromGML(${pointGml}), geofile)` })
          .from(areasTable)
          .where(eq(areasTable.id, areaId));

        if (!within?.ok) {
          throw new WfsException(
            'OutsideArea',
            `Stand point is outside the boundary of "${area.name}". To save it anyway, set the force_outside_area attribute to 1 and save again.`,
          );
        }
      }

      const [stand] = await db
        .insert(standsTable)
        .values({
          number: number.trim(),
          areaId,
          ...(pointGml ? { location: sql`ST_GeomFromGML(${pointGml})` } : {}),
        })
        .returning({ id: standsTable.id });

      await audit({ userId, event: 'stand_created', ip, metadata: { standId: stand.id, areaId, source: 'wfs' } });
      features.push({ typeName, id: stand.id });
      count++;
    }
  }
  return { count, features };
}

// ── Update ────────────────────────────────────────────────────────────────────

async function handleUpdate(op: Element, estateId: number, userId: number, ip: string | undefined): Promise<number> {
  const typeName = stripNs(op.getAttribute('typeName') ?? '');
  const filterEl = getChildElement(op, 'Filter');
  const featureIdEl = filterEl ? getElementsByLocalName(filterEl, 'FeatureId')[0] ?? getElementsByLocalName(filterEl, 'GmlObjectId')[0] : null;
  // WFS 1.1.0: QGIS uses GmlObjectId with gml:id attribute; FeatureId uses fid.
  const fid = featureIdEl?.getAttribute('fid') ?? featureIdEl?.getAttribute('gml:id') ?? featureIdEl?.getAttribute('id');
  if (!fid) throw new WfsException('MissingParameter', 'Filter with FeatureId is required for Update.');

  const idStr = fid.split('.').pop() ?? '';
  const featureId = Number(idStr);
  if (isNaN(featureId)) throw new WfsException('InvalidParameter', `Invalid feature id: ${fid}`);

  const props: Record<string, Element> = {};
  const propertyEls = getElementsByLocalName(op, 'Property');
  for (const prop of propertyEls) {
    const nameEl = getChildElement(prop, 'Name');
    const valueEl = getChildElement(prop, 'Value');
    if (nameEl?.textContent) props[stripNs(nameEl.textContent.trim())] = valueEl!;
  }

  const areaPolygonId = parseAreaPolygonId(typeName);
  if (areaPolygonId !== null) {
    const [area] = await db
      .select({ id: areasTable.id })
      .from(areasTable)
      .where(and(eq(areasTable.id, areaPolygonId), eq(areasTable.estateId, estateId)))
      .limit(1);
    if (!area) throw new WfsException('NotFound', 'Area not found.');

    const updates: Record<string, unknown> = {};
    if (props['name']) updates.name = props['name'].textContent?.trim();

    const geofileValueEl = props['geofile'];
    if (geofileValueEl) {
      const geomEl = getChildElement(geofileValueEl, 'MultiSurface') ?? getChildElement(geofileValueEl, 'MultiPolygon') ?? getChildElement(geofileValueEl, 'GeometryCollection') ?? getChildElement(geofileValueEl, 'Polygon');
      if (geomEl) {
        const wkt = gmlPolygonToWkt(geomEl);
        if (wkt) updates.geofile = sql`ST_GeomFromText(${wkt}, 4326)`;
      }
    }

    if (Object.keys(updates).length > 0) {
      await db.update(areasTable).set(updates).where(eq(areasTable.id, areaPolygonId));
      await audit({ userId, event: 'area_updated', ip, metadata: { areaId: areaPolygonId, source: 'wfs' } });
    }
    return 1;
  }

  const areaId = parseAreaId(typeName);
  if (areaId === null) throw new WfsException('InvalidParameter', `Unknown feature type: ${typeName}`);

  const [area] = await db
    .select({ id: areasTable.id, name: areasTable.name, hasGeofile: sql<boolean>`geofile IS NOT NULL` })
    .from(areasTable)
    .where(and(eq(areasTable.id, areaId), eq(areasTable.estateId, estateId)))
    .limit(1);
  if (!area) throw new WfsException('NotFound', 'Area not found.');

  const [stand] = await db
    .select({ id: standsTable.id })
    .from(standsTable)
    .where(and(eq(standsTable.id, featureId), eq(standsTable.areaId, areaId)))
    .limit(1);
  if (!stand) throw new WfsException('NotFound', 'Stand not found.');

  const updates: Record<string, unknown> = {};
  if (props['number']) updates.number = props['number'].textContent?.trim();

  const forceRaw = props['force_outside_area']?.textContent?.trim();
  const force = forceRaw === '1' || forceRaw === 'true';

  const locationValueEl = props['location'];
  if (locationValueEl) {
    const pointEl = getChildElement(locationValueEl, 'Point');
    const pointGml = pointEl ? serializeElement(pointEl) : null;
    if (pointGml) {
      if (!force && area.hasGeofile) {
        const [within] = await db
          .select({ ok: sql<boolean>`ST_Within(ST_GeomFromGML(${pointGml}), geofile)` })
          .from(areasTable)
          .where(eq(areasTable.id, areaId));

        if (!within?.ok) {
          throw new WfsException(
            'OutsideArea',
            `Stand point is outside the boundary of "${area.name}". To save it anyway, set the force_outside_area attribute to 1 and save again.`,
          );
        }
      }
      updates.location = sql`ST_GeomFromGML(${pointGml})`;
    }
  }

  if (Object.keys(updates).length > 0) {
    await db.update(standsTable).set(updates).where(eq(standsTable.id, featureId));
    await audit({ userId, event: 'stand_updated', ip, metadata: { standId: featureId, areaId, source: 'wfs' } });
  }
  return 1;
}

// ── Delete ────────────────────────────────────────────────────────────────────

async function handleDelete(op: Element, estateId: number, userId: number, ip: string | undefined): Promise<number> {
  const typeName = stripNs(op.getAttribute('typeName') ?? '');

  if (parseAreaPolygonId(typeName) !== null) {
    throw new WfsException('OperationNotSupported', 'Deleting areas via WFS-T is not allowed. Use the web interface.');
  }

  const areaId = parseAreaId(typeName);
  if (areaId === null) throw new WfsException('InvalidParameter', `Unknown feature type: ${typeName}`);

  const filterEl = getChildElement(op, 'Filter');
  const featureIdEls = filterEl ? getElementsByLocalName(filterEl, 'FeatureId').concat(getElementsByLocalName(filterEl, 'GmlObjectId')) : [];

  let count = 0;
  for (const fidEl of featureIdEls) {
    const fid = fidEl.getAttribute('fid') ?? fidEl.getAttribute('id') ?? '';
    const idStr = fid.split('.').pop() ?? '';
    const featureId = Number(idStr);
    if (isNaN(featureId)) continue;

    const [stand] = await db
      .select({ id: standsTable.id })
      .from(standsTable)
      .where(and(eq(standsTable.id, featureId), eq(standsTable.areaId, areaId)))
      .limit(1);

    // verify the area belongs to this estate
    const [area] = await db
      .select({ id: areasTable.id })
      .from(areasTable)
      .where(and(eq(areasTable.id, areaId), eq(areasTable.estateId, estateId)))
      .limit(1);

    if (!stand || !area) continue;

    await db.delete(standsTable).where(eq(standsTable.id, featureId));
    await audit({ userId, event: 'stand_deleted', ip, metadata: { standId: featureId, areaId, source: 'wfs' } });
    count++;
  }
  return count;
}
