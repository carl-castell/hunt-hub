import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import app from '@/app';
import { db } from '@/db';
import { accountsTable } from '@/db/schema/accounts';
import { areasTable } from '@/db/schema/areas';
import { standsTable } from '@/db/schema/stands';
import { setupManager, teardown, ManagerSetup } from '@/tests/helpers/manager';

const WFS_TOKEN = 'wfs-integration-test-token';

let setup: ManagerSetup;
let areaId: number;
let geoAreaId: number;
let standId: number;

beforeAll(async () => {
  setup = await setupManager('wfs');

  await db.update(accountsTable)
    .set({ wfsToken: WFS_TOKEN })
    .where(eq(accountsTable.userId, setup.managerId));

  const [area] = await db.insert(areasTable)
    .values({ name: 'WFS Test Area', estateId: setup.estateId })
    .returning();
  areaId = area.id;

  const [geoArea] = await db.insert(areasTable)
    .values({ name: 'WFS Geo Area', estateId: setup.estateId })
    .returning();
  geoAreaId = geoArea.id;

  const [stand] = await db.insert(standsTable)
    .values({ number: 'S1', areaId })
    .returning();
  standId = stand.id;
});

afterAll(async () => {
  await teardown(setup.estateId);
});

describe('GET /wfs — authentication', () => {
  it('returns 401 XML with no token', async () => {
    const res = await request(app).get('/wfs?request=GetCapabilities');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toContain('text/xml');
    expect(res.text).toContain('ExceptionReport');
    expect(res.headers['www-authenticate']).toContain('Bearer');
  });

  it('returns 401 XML with an invalid token', async () => {
    const res = await request(app).get('/wfs?request=GetCapabilities&token=bad-token');
    expect(res.status).toBe(401);
    expect(res.text).toContain('ExceptionReport');
  });
});

describe('GET /wfs — GetCapabilities', () => {
  it('returns 200 XML listing estate areas', async () => {
    const res = await request(app).get(`/wfs?request=GetCapabilities&token=${WFS_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/xml');
    expect(res.text).toContain('WFS_Capabilities');
    expect(res.text).toContain('WFS Test Area');
    expect(res.text).toContain(`stands_${areaId}`);
    expect(res.text).toContain(`area_${areaId}`);
  });
});

describe('GET /wfs — DescribeFeatureType', () => {
  it('returns 200 XSD schema for a stands layer', async () => {
    const res = await request(app).get(`/wfs?request=DescribeFeatureType&typeNames=stands_${areaId}&token=${WFS_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('xs:schema');
    expect(res.text).toContain('standsType');
  });

  it('returns 200 XSD schema for an area polygon layer', async () => {
    const res = await request(app).get(`/wfs?request=DescribeFeatureType&typeNames=area_${areaId}&token=${WFS_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('areasType');
  });
});

describe('GET /wfs — GetFeature', () => {
  it('returns FeatureCollection for stands layer', async () => {
    const res = await request(app).get(`/wfs?request=GetFeature&typeNames=stands_${areaId}&token=${WFS_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('FeatureCollection');
    expect(res.text).toContain('S1');
  });

  it('returns FeatureCollection for area polygon layer (empty when no geofile)', async () => {
    const res = await request(app).get(`/wfs?request=GetFeature&typeNames=area_${areaId}&token=${WFS_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('FeatureCollection');
  });

  it('returns 404 ExceptionReport for a non-existent area', async () => {
    const res = await request(app).get(`/wfs?request=GetFeature&typeNames=stands_999999&token=${WFS_TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.text).toContain('ExceptionReport');
  });

  it('returns 400 ExceptionReport for an unknown typeNames pattern', async () => {
    const res = await request(app).get(`/wfs?request=GetFeature&typeNames=unknown_layer&token=${WFS_TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.text).toContain('ExceptionReport');
  });
});

describe('GET /wfs — unsupported request', () => {
  it('returns 400 ExceptionReport for an unknown REQUEST param', async () => {
    const res = await request(app).get(`/wfs?request=LockFeature&token=${WFS_TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.text).toContain('OperationNotSupported');
  });
});

describe('POST /wfs — Transaction: stand operations', () => {
  let insertedStandId: number;

  it('inserts a stand and reports totalInserted=1', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:Transaction version="1.1.0" service="WFS"
  xmlns:wfs="http://www.opengis.net/wfs"
  xmlns:ms="http://mapserver.gis.umn.edu/mapserver">
  <wfs:Insert>
    <ms:stands_${areaId}>
      <ms:number>WFS Stand</ms:number>
    </ms:stands_${areaId}>
  </wfs:Insert>
</wfs:Transaction>`;

    const res = await request(app)
      .post(`/wfs?token=${WFS_TOKEN}`)
      .set('Content-Type', 'text/xml')
      .send(xml);

    expect(res.status).toBe(200);
    expect(res.text).toContain('<wfs:totalInserted>1</wfs:totalInserted>');
    expect(res.text).toContain(`stands_${areaId}`);

    const match = res.text.match(/fid="stands_\d+\.(\d+)"/);
    insertedStandId = match ? Number(match[1]) : 0;
    expect(insertedStandId).toBeGreaterThan(0);
  });

  it('updates a stand number and reports totalUpdated=1', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:Transaction version="1.1.0" service="WFS"
  xmlns:wfs="http://www.opengis.net/wfs"
  xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:ms="http://mapserver.gis.umn.edu/mapserver">
  <wfs:Update typeName="ms:stands_${areaId}">
    <wfs:Property>
      <wfs:Name>number</wfs:Name>
      <wfs:Value>S1-renamed</wfs:Value>
    </wfs:Property>
    <ogc:Filter>
      <ogc:FeatureId fid="stands_${areaId}.${standId}"/>
    </ogc:Filter>
  </wfs:Update>
</wfs:Transaction>`;

    const res = await request(app)
      .post(`/wfs?token=${WFS_TOKEN}`)
      .set('Content-Type', 'text/xml')
      .send(xml);

    expect(res.status).toBe(200);
    expect(res.text).toContain('<wfs:totalUpdated>1</wfs:totalUpdated>');

    const [row] = await db.select({ number: standsTable.number }).from(standsTable).where(eq(standsTable.id, standId)).limit(1);
    expect(row.number).toBe('S1-renamed');
  });

  it('deletes a stand and reports totalDeleted=1', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:Transaction version="1.1.0" service="WFS"
  xmlns:wfs="http://www.opengis.net/wfs"
  xmlns:ogc="http://www.opengis.net/ogc">
  <wfs:Delete typeName="ms:stands_${areaId}">
    <ogc:Filter>
      <ogc:FeatureId fid="stands_${areaId}.${insertedStandId}"/>
    </ogc:Filter>
  </wfs:Delete>
</wfs:Transaction>`;

    const res = await request(app)
      .post(`/wfs?token=${WFS_TOKEN}`)
      .set('Content-Type', 'text/xml')
      .send(xml);

    expect(res.status).toBe(200);
    expect(res.text).toContain('<wfs:totalDeleted>1</wfs:totalDeleted>');
  });
});

describe('WFS stand attributes: nickname, status, status date', () => {
  const post = (body: string) => request(app).post(`/wfs?token=${WFS_TOKEN}`).set('Content-Type', 'text/xml').send(body);
  const tx = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?>
<wfs:Transaction version="1.1.0" service="WFS"
  xmlns:wfs="http://www.opengis.net/wfs"
  xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:ms="http://mapserver.gis.umn.edu/mapserver">${inner}</wfs:Transaction>`;
  let id: number;

  it('describes the new columns', async () => {
    const res = await request(app).get(`/wfs?request=DescribeFeatureType&typeName=stands_${areaId}&token=${WFS_TOKEN}`);
    expect(res.text).toContain('name="nickname"');
    expect(res.text).toContain('name="status"');
    expect(res.text).toContain('name="status_date"');
  });

  it('inserts a stand with nickname and status', async () => {
    const res = await post(tx(`<wfs:Insert><ms:stands_${areaId}>
      <ms:number>A1</ms:number><ms:nickname>Eiche</ms:nickname><ms:status>broken</ms:status>
    </ms:stands_${areaId}></wfs:Insert>`));
    expect(res.status).toBe(200);
    id = Number(res.text.match(/fid="stands_\d+\.(\d+)"/)![1]);
    const [row] = await db.select().from(standsTable).where(eq(standsTable.id, id));
    expect(row).toMatchObject({ nickname: 'Eiche', status: 'broken' });
    expect(row.statusDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns them in GetFeature', async () => {
    const res = await request(app).get(`/wfs?request=GetFeature&typeName=stands_${areaId}&token=${WFS_TOKEN}`);
    expect(res.text).toContain('<ms:nickname>Eiche</ms:nickname>');
    expect(res.text).toContain('<ms:status>broken</ms:status>');
    expect(res.text).toMatch(/<ms:status_date>\d{4}-\d{2}-\d{2}<\/ms:status_date>/);
  });

  it('updates the status with a date and clears the nickname', async () => {
    const res = await post(tx(`<wfs:Update typeName="ms:stands_${areaId}">
      <wfs:Property><wfs:Name>status</wfs:Name><wfs:Value>ok</wfs:Value></wfs:Property>
      <wfs:Property><wfs:Name>status_date</wfs:Name><wfs:Value>2026-11-03Z</wfs:Value></wfs:Property>
      <wfs:Property><wfs:Name>nickname</wfs:Name></wfs:Property>
      <ogc:Filter><ogc:FeatureId fid="stands_${areaId}.${id}"/></ogc:Filter>
    </wfs:Update>`));
    expect(res.status).toBe(200);
    expect(res.text).toContain('<wfs:totalUpdated>1</wfs:totalUpdated>');
    const [row] = await db.select().from(standsTable).where(eq(standsTable.id, id));
    expect(row).toMatchObject({ nickname: null, status: 'ok', statusDate: '2026-11-03' });
  });

  it('refuses an unknown status and names the allowed ones', async () => {
    const res = await post(tx(`<wfs:Update typeName="ms:stands_${areaId}">
      <wfs:Property><wfs:Name>status</wfs:Name><wfs:Value>kaputt</wfs:Value></wfs:Property>
      <ogc:Filter><ogc:FeatureId fid="stands_${areaId}.${id}"/></ogc:Filter>
    </wfs:Update>`));
    expect(res.text).toContain('ExceptionReport');
    expect(res.text).toContain('ok, needs_repair, broken, removed');
    const [row] = await db.select().from(standsTable).where(eq(standsTable.id, id));
    expect(row.status).toBe('ok');
  });
});

describe('POST /wfs — Transaction: area polygon operations', () => {
  it('sets area geofile via WFS Insert and reports totalInserted=1', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:Transaction version="1.1.0" service="WFS"
  xmlns:wfs="http://www.opengis.net/wfs"
  xmlns:gml="http://www.opengis.net/gml"
  xmlns:ms="http://mapserver.gis.umn.edu/mapserver">
  <wfs:Insert>
    <ms:area_${geoAreaId}>
      <ms:geofile>
        <gml:Polygon>
          <gml:exterior>
            <gml:LinearRing>
              <gml:posList>10.0 55.0 10.1 55.0 10.1 55.1 10.0 55.1 10.0 55.0</gml:posList>
            </gml:LinearRing>
          </gml:exterior>
        </gml:Polygon>
      </ms:geofile>
    </ms:area_${geoAreaId}>
  </wfs:Insert>
</wfs:Transaction>`;

    const res = await request(app)
      .post(`/wfs?token=${WFS_TOKEN}`)
      .set('Content-Type', 'text/xml')
      .send(xml);

    expect(res.status).toBe(200);
    expect(res.text).toContain('<wfs:totalInserted>1</wfs:totalInserted>');
  });

  it('returns ExceptionReport when trying to insert a second geofile on the same area', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:Transaction version="1.1.0" service="WFS"
  xmlns:wfs="http://www.opengis.net/wfs"
  xmlns:gml="http://www.opengis.net/gml"
  xmlns:ms="http://mapserver.gis.umn.edu/mapserver">
  <wfs:Insert>
    <ms:area_${geoAreaId}>
      <ms:geofile>
        <gml:Polygon>
          <gml:exterior>
            <gml:LinearRing>
              <gml:posList>10.0 55.0 10.1 55.0 10.1 55.1 10.0 55.1 10.0 55.0</gml:posList>
            </gml:LinearRing>
          </gml:exterior>
        </gml:Polygon>
      </ms:geofile>
    </ms:area_${geoAreaId}>
  </wfs:Insert>
</wfs:Transaction>`;

    const res = await request(app)
      .post(`/wfs?token=${WFS_TOKEN}`)
      .set('Content-Type', 'text/xml')
      .send(xml);

    expect(res.status).toBe(400);
    expect(res.text).toContain('ExceptionReport');
    expect(res.text).toContain('OperationNotSupported');
  });

  it('returns ExceptionReport when trying to delete an area via WFS', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:Transaction version="1.1.0" service="WFS"
  xmlns:wfs="http://www.opengis.net/wfs"
  xmlns:ogc="http://www.opengis.net/ogc">
  <wfs:Delete typeName="ms:area_${geoAreaId}">
    <ogc:Filter>
      <ogc:FeatureId fid="area_${geoAreaId}.${geoAreaId}"/>
    </ogc:Filter>
  </wfs:Delete>
</wfs:Transaction>`;

    const res = await request(app)
      .post(`/wfs?token=${WFS_TOKEN}`)
      .set('Content-Type', 'text/xml')
      .send(xml);

    expect(res.status).toBe(400);
    expect(res.text).toContain('ExceptionReport');
    expect(res.text).toContain('OperationNotSupported');
  });
});
