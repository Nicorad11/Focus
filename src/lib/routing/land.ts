// Decodes public/data/land.json (quantised, delta-encoded polygons; see scripts/build-data.mjs).

export interface LandPolygon {
  /** [west, south, east, north] in degrees */
  bbox: [number, number, number, number];
  /** Each ring is a flat [lon, lat, lon, lat, ...] array; the first ring is the outline, the rest are holes. */
  rings: Float64Array[];
}

export interface LandFile {
  q: number;
  polys: number[][][];
}

export function decodeLand(file: LandFile): LandPolygon[] {
  const { q } = file;
  const out: LandPolygon[] = [];
  for (const poly of file.polys) {
    let w = Infinity;
    let s = Infinity;
    let e = -Infinity;
    let n = -Infinity;
    const rings: Float64Array[] = [];
    for (const enc of poly) {
      const ring = new Float64Array(enc.length + 2);
      let x = 0;
      let y = 0;
      for (let i = 0; i < enc.length; i += 2) {
        x += enc[i];
        y += enc[i + 1];
        const lon = x / q;
        const lat = y / q;
        ring[i] = lon;
        ring[i + 1] = lat;
        if (lon < w) w = lon;
        if (lon > e) e = lon;
        if (lat < s) s = lat;
        if (lat > n) n = lat;
      }
      // close the ring
      ring[enc.length] = ring[0];
      ring[enc.length + 1] = ring[1];
      rings.push(ring);
    }
    out.push({ bbox: [w, s, e, n], rings });
  }
  return out;
}

export function landToGeoJSON(polys: LandPolygon[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: 'FeatureCollection',
    features: polys.map((p) => ({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: p.rings.map((r) => {
          const ring: number[][] = [];
          for (let i = 0; i < r.length; i += 2) ring.push([r[i], r[i + 1]]);
          return ring;
        }),
      },
    })),
  };
}
