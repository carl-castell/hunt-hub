(function () {
  'use strict';

  fetch('/map/layers')
    .then(function (r) { return r.json(); })
    .then(function (config) {
      document.querySelectorAll('[data-map]').forEach(function (container) {
        initMap(container, config.layers);
      });
    })
    .catch(function (err) {
      console.error('[map.js] Failed to load layer config', err);
    });

  function initMap(container, layerDefs) {
    const id        = container.id;
    const height    = container.dataset.height  || '400px';
    const defaultId = container.dataset.tile    || 'osm';
    const mode      = container.dataset.mode    || 'view';
    const dataUrl   = container.dataset.url     || null;
    const allowed   = (container.dataset.layers || 'osm,topo,satellite').split(',');

    container.style.height = height;

    // ── Tile layers ──────────────────────────────────────────────────────────
    const tileLayers = {};
    const baseMaps   = {};

    layerDefs.forEach(function (def) {
      if (!allowed.includes(def.id)) return;
      const layer = L.tileLayer(def.url, {
        attribution: def.attribution,
        maxZoom: def.maxZoom,
      });
      tileLayers[def.id]  = layer;
      baseMaps[def.label] = layer;
    });

    const defaultLayer = tileLayers[defaultId] || Object.values(tileLayers)[0];

    const map = L.map(id, {
      layers: [defaultLayer],
      zoomControl: true,
    });

    // ── Layer switcher ───────────────────────────────────────────────────────
    if (Object.keys(baseMaps).length > 1) {
      L.control.layers(baseMaps, {}, { position: 'topright' }).addTo(map);
    }

    // ── Fullscreen ───────────────────────────────────────────────────────────
    const fsControl = L.control({ position: 'topleft' });
    fsControl.onAdd = function () {
      const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      div.style.cssText = 'width:26px;height:26px;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;';
      div.innerHTML = '⛶';
      div.title = 'Toggle fullscreen';

      L.DomEvent.on(div, 'click', function (e) {
        L.DomEvent.stopPropagation(e);
        if (!document.fullscreenElement) {
          container.requestFullscreen();
          div.innerHTML = '✕';
        } else {
          document.exitFullscreen();
          div.innerHTML = '⛶';
        }
      });

      document.addEventListener('fullscreenchange', function () {
        div.innerHTML = document.fullscreenElement ? '✕' : '⛶';
        map.invalidateSize();
      });

      return div;
    };
    fsControl.addTo(map);

    // ── Load GeoJSON ─────────────────────────────────────────────────────────
    if (dataUrl) {
      fetch(dataUrl)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (geojson) { if (geojson) renderGeoJSON(map, geojson); })
        .catch(function (err) { console.error('[map.js] Failed to load map data', err); });
    } else {
      map.setView([51.505, -0.09], 5);
    }

    // ── Point mode ───────────────────────────────────────────────────────────
    if (mode === 'point') {
      initPointMode(map, container);
    }
  }

function renderGeoJSON(map, geojson) {
  // 1) Normalise to FeatureCollection (Leaflet likes this)
  let featureCollection;
  if (geojson.type === 'GeometryCollection') {
    featureCollection = {
      type: 'FeatureCollection',
      features: geojson.geometries.map(function (g) {
        return { type: 'Feature', geometry: g, properties: {} };
      }),
    };
  } else if (geojson.type === 'FeatureCollection') {
    featureCollection = geojson;
  } else if (geojson.type === 'Feature') {
    featureCollection = { type: 'FeatureCollection', features: [geojson] };
  } else {
    featureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: geojson, properties: {} }],
    };
  }

  // 2) Build world mask: dark overlay with area outer rings punched out.
  // Inner rings (holes in the area polygon) are re-shaded by adding them
  // back as solid dark polygons in the same MultiPolygon.
  function collectRings(geom) {
    if (!geom) return { outer: [], inner: [] };

    if (geom.type === 'Polygon') {
      var coords = geom.coordinates || [];
      return { outer: coords[0] ? [coords[0]] : [], inner: coords.slice(1) };
    }

    if (geom.type === 'MultiPolygon') {
      var outer = [], inner = [];
      (geom.coordinates || []).forEach(function (polyCoords) {
        if (polyCoords && polyCoords[0]) outer.push(polyCoords[0]);
        (polyCoords || []).slice(1).forEach(function (ring) { inner.push(ring); });
      });
      return { outer: outer, inner: inner };
    }

    if (geom.type === 'GeometryCollection') {
      var result = { outer: [], inner: [] };
      (geom.geometries || []).forEach(function (g) {
        var rings = collectRings(g);
        result.outer = result.outer.concat(rings.outer);
        result.inner = result.inner.concat(rings.inner);
      });
      return result;
    }

    return { outer: [], inner: [] };
  }

  var allOuter = [], allInner = [];
  featureCollection.features.forEach(function (f) {
    var rings = collectRings(f.geometry);
    allOuter = allOuter.concat(rings.outer);
    allInner = allInner.concat(rings.inner);
  });

  if (allOuter.length) {
    var worldRing = [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]];

    // First polygon: world with area outer rings as holes (area becomes bright).
    // Additional polygons: one per inner ring, solid dark (re-shades each hole).
    var maskPolygons = [[worldRing].concat(allOuter)];
    allInner.forEach(function (ring) { maskPolygons.push([ring]); });

    L.geoJSON(
      {
        type: 'Feature',
        geometry: { type: 'MultiPolygon', coordinates: maskPolygons },
        properties: {},
      },
      { style: { color: 'transparent', fillColor: '#000', fillOpacity: 0.3 } }
    ).addTo(map);
  }

  // 3) Outline
  const areaLayer = L.geoJSON(featureCollection, {
    style: { color: '#e63946', weight: 2, fillOpacity: 0 },
  }).addTo(map);

  map.fitBounds(areaLayer.getBounds(), { padding: [20, 20] });
}



  // ── Point placement ────────────────────────────────────────────────────────
  function initPointMode(map, container) {
    let pendingMarker = null;
    let active = false;

    const ptControl = L.control({ position: 'topleft' });
    ptControl.onAdd = function () {
      const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      div.style.cssText = 'width:26px;height:26px;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;';
      div.innerHTML = '📍';
      div.title = 'Place a point';

      L.DomEvent.on(div, 'click', function (e) {
        L.DomEvent.stopPropagation(e);
        active = !active;
        div.style.background = active ? '#e63946' : '#fff';
        div.style.color      = active ? '#fff'    : 'inherit';
        map.getContainer().style.cursor = active ? 'crosshair' : '';
      });

      return div;
    };
    ptControl.addTo(map);

    map.on('click', function (e) {
      if (!active) return;
      if (pendingMarker) map.removeLayer(pendingMarker);
      pendingMarker = L.marker(e.latlng).addTo(map);

      container.dispatchEvent(new CustomEvent('map:pointplaced', {
        bubbles: true,
        detail: { lat: e.latlng.lat, lng: e.latlng.lng },
      }));

      active = false;
      map.getContainer().style.cursor = '';
    });

    container.addEventListener('map:cancelpoint', function () {
      if (pendingMarker) { map.removeLayer(pendingMarker); pendingMarker = null; }
    });
  }

})();
