import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type Ref } from 'react';
import type { GeoJSONSource, LayerSpecification, Map as MlMap, Marker, PaddingOptions, StyleSpecification } from 'maplibre-gl';
import maplibregl from './maplibre';
import { highDetailLand, lowDetailLand, regionLand, type BBox } from './landSource';
import { bounds, type LonLat } from '../../lib/geo';
import { loadPorts } from '../../lib/ports';
import { CompassRose } from './CompassRose';

export type ChartPortKind = 'home' | 'origin' | 'dest' | 'option' | 'waypoint' | 'visited';

export interface ChartPort {
  id: string;
  pos: LonLat;
  name: string;
  sub?: string;
  kind: ChartPortKind;
  side?: 'left' | 'right';
}

export interface ChartRoute {
  id: string;
  coords: LonLat[];
  style: 'plan' | 'todo' | 'done' | 'past' | 'today';
}

export interface ChartFit {
  key: string;
  points: LonLat[];
  padding?: Partial<PaddingOptions>;
  maxZoom?: number;
  zoom?: number;
  animate?: boolean;
}

export interface ChartHandle {
  zoomIn(): void;
  zoomOut(): void;
  flyTo(pos: LonLat, zoom?: number): void;
}

interface Props {
  ports?: ChartPort[];
  routes?: ChartRoute[];
  boat?: { pos: LonLat; course: number } | null;
  fit?: ChartFit | null;
  /** show every harbour as a small clickable dot */
  harbours?: boolean;
  interactive?: boolean;
  decor?: boolean;
  globe?: boolean;
  compassStyle?: CSSProperties;
  scaleStyle?: CSSProperties;
  onPortClick?: (id: string) => void;
  handle?: Ref<ChartHandle>;
  className?: string;
  label?: string;
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

interface Colors {
  sea: string;
  land: string;
  coast: string;
  band: string;
  contour: string;
  graticule: string;
  red: string;
  teal: string;
  halo: string;
  dot: string;
  ink: string;
}

function readColors(): Colors {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    sea: v('--sea'),
    land: v('--land'),
    coast: v('--coast'),
    band: v('--coast-band'),
    contour: v('--contour'),
    graticule: v('--graticule'),
    red: v('--red-bright'),
    teal: v('--teal'),
    halo: v('--label-halo'),
    dot: v('--port-dot'),
    ink: v('--ink'),
  };
}

const bandWidth = ['interpolate', ['linear'], ['zoom'], 1, 2, 4, 8, 6, 14, 10, 18] as unknown as number;
const contourGap = ['interpolate', ['linear'], ['zoom'], 4, 18, 7, 34, 10, 48] as unknown as number;

/** Zoom at which the chart switches from the 1:50m coastline to regional 1:10m detail. */
const HI_ZOOM = 5.5;

function shoreLayers(c: Colors, source: string, suffix: string, zoom: { minzoom?: number; maxzoom?: number }, fillSource: string): LayerSpecification[] {
  return [
    {
      id: 'contour' + suffix,
      type: 'line',
      source,
      ...zoom,
      minzoom: Math.max(zoom.minzoom ?? 0, 4),
      layout: { 'line-join': 'round' },
      paint: { 'line-color': c.contour, 'line-width': 0.8, 'line-gap-width': contourGap, 'line-dasharray': [1, 3], 'line-opacity': 0.7 },
    },
    { id: 'band' + suffix, type: 'line', source, ...zoom, layout: { 'line-join': 'round' }, paint: { 'line-color': c.band, 'line-width': bandWidth } },
    {
      id: 'band-edge' + suffix,
      type: 'line',
      source,
      ...zoom,
      minzoom: Math.max(zoom.minzoom ?? 0, 3),
      layout: { 'line-join': 'round' },
      paint: { 'line-color': c.contour, 'line-width': 0.8, 'line-gap-width': bandWidth, 'line-opacity': 0.5 },
    },
    { id: 'land' + suffix, type: 'fill', source: fillSource, ...zoom, paint: { 'fill-color': c.land, 'fill-antialias': suffix === '-lo' } },
    { id: 'coast' + suffix, type: 'line', source, ...zoom, paint: { 'line-color': c.coast, 'line-width': 0.9, 'line-opacity': 0.55 } },
  ] as LayerSpecification[];
}

function makeStyle(c: Colors): StyleSpecification {
  const harbourPaint = (radius: number) => ({
    'circle-radius': radius,
    'circle-color': c.dot,
    'circle-stroke-color': c.ink,
    'circle-stroke-width': 1.3,
    'circle-stroke-opacity': 0.75,
  });
  return {
    version: 8,
    sources: {
      'land-lo': { type: 'geojson', data: EMPTY, tolerance: 0.3 },
      'land-hi': { type: 'geojson', data: EMPTY, tolerance: 0.25, buffer: 32 },
      'shore-hi': { type: 'geojson', data: EMPTY, tolerance: 0.25, buffer: 32 },
      graticule: { type: 'geojson', data: EMPTY },
      routes: { type: 'geojson', data: EMPTY },
      harbours: { type: 'geojson', data: EMPTY },
    },
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': c.sea } },
      { id: 'graticule', type: 'line', source: 'graticule', paint: { 'line-color': c.graticule, 'line-width': 0.6 } },
      ...shoreLayers(c, 'land-lo', '-lo', { maxzoom: HI_ZOOM }, 'land-lo'),
      ...shoreLayers(c, 'shore-hi', '-hi', { minzoom: HI_ZOOM }, 'land-hi'),
      { id: 'harbours-major', type: 'circle', source: 'harbours', filter: ['>=', ['get', 'size'], 5], minzoom: 3, paint: harbourPaint(3.6) },
      { id: 'harbours-mid', type: 'circle', source: 'harbours', filter: ['all', ['>=', ['get', 'size'], 3], ['<', ['get', 'size'], 5]], minzoom: 4.5, paint: harbourPaint(3.4) },
      { id: 'harbours-small', type: 'circle', source: 'harbours', filter: ['==', ['get', 'size'], 2], minzoom: 6, paint: harbourPaint(3.1) },
      { id: 'harbours-tiny', type: 'circle', source: 'harbours', filter: ['==', ['get', 'size'], 1], minzoom: 7.2, paint: harbourPaint(2.8) },
      {
        id: 'route-casing',
        type: 'line',
        source: 'routes',
        filter: ['in', ['get', 'style'], ['literal', ['plan', 'todo', 'done', 'today']]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': c.halo, 'line-width': 6.6, 'line-opacity': 0.9 },
      },
      {
        id: 'route-past',
        type: 'line',
        source: 'routes',
        filter: ['==', ['get', 'style'], 'past'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': c.teal, 'line-width': 2.4 },
      },
      {
        id: 'route-todo',
        type: 'line',
        source: 'routes',
        filter: ['in', ['get', 'style'], ['literal', ['plan', 'todo']]],
        layout: { 'line-join': 'round' },
        paint: { 'line-color': c.red, 'line-width': 2.6, 'line-dasharray': [2.2, 1.6] },
      },
      {
        id: 'route-done',
        type: 'line',
        source: 'routes',
        filter: ['in', ['get', 'style'], ['literal', ['done', 'today']]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': c.red, 'line-width': 3 },
      },
    ],
  };
}

const HARBOUR_LAYERS = ['harbours-major', 'harbours-mid', 'harbours-small', 'harbours-tiny'];

function applyColors(map: MlMap, c: Colors) {
  const set = (layer: string, prop: string, value: string) => {
    if (map.getLayer(layer)) map.setPaintProperty(layer, prop, value);
  };
  set('sea', 'background-color', c.sea);
  set('graticule', 'line-color', c.graticule);
  for (const sfx of ['-lo', '-hi']) {
    set('contour' + sfx, 'line-color', c.contour);
    set('band' + sfx, 'line-color', c.band);
    set('band-edge' + sfx, 'line-color', c.contour);
    set('land' + sfx, 'fill-color', c.land);
    set('coast' + sfx, 'line-color', c.coast);
  }
  for (const l of HARBOUR_LAYERS) {
    set(l, 'circle-color', c.dot);
    set(l, 'circle-stroke-color', c.ink);
  }
  set('route-casing', 'line-color', c.halo);
  set('route-past', 'line-color', c.teal);
  set('route-todo', 'line-color', c.red);
  set('route-done', 'line-color', c.red);
}

/** Graticule spacing in degrees for a zoom level. */
function graticuleStep(zoom: number): number {
  if (zoom < 2.5) return 20;
  if (zoom < 3.5) return 10;
  if (zoom < 4.5) return 5;
  if (zoom < 5.5) return 2;
  if (zoom < 6.5) return 1;
  if (zoom < 7.5) return 0.5;
  if (zoom < 8.7) return 1 / 3;
  if (zoom < 10) return 1 / 6;
  return 1 / 12;
}

function graticule(map: MlMap): { fc: GeoJSON.FeatureCollection; step: number } {
  const b = map.getBounds();
  const step = graticuleStep(map.getZoom());
  const w = Math.floor(b.getWest() / step) * step;
  const e = Math.ceil(b.getEast() / step) * step;
  const s = Math.max(-85, Math.floor(b.getSouth() / step) * step);
  const n = Math.min(85, Math.ceil(b.getNorth() / step) * step);
  const features: GeoJSON.Feature[] = [];
  const count = (e - w) / step + (n - s) / step;
  if (count > 400) return { fc: EMPTY, step };
  for (let x = w; x <= e + 1e-9; x += step) {
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[x, s], [x, (s + n) / 2], [x, n]] } });
  }
  for (let y = s; y <= n + 1e-9; y += step) {
    const coords: number[][] = [];
    for (let x = w; x <= e + 1e-9; x += Math.max(step, (e - w) / 32)) coords.push([x, y]);
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
  }
  return { fc: { type: 'FeatureCollection', features }, step };
}

function fmtDeg(v: number, pos: string, neg: string, step: number): string {
  let x = v;
  if (pos === 'E') {
    while (x > 180) x -= 360;
    while (x < -180) x += 360;
  }
  const hemi = Math.abs(x) < 1e-9 ? '' : x > 0 ? pos : neg;
  const abs = Math.abs(x);
  let d = Math.floor(abs + 1e-9);
  let m = Math.round((abs - d) * 60);
  if (m === 60) {
    d++;
    m = 0;
  }
  return step >= 1 ? `${d}°${hemi}` : `${d}°${String(m).padStart(2, '0')}′${hemi}`;
}

interface Edges {
  lats: { y: number; text: string }[];
  lons: { x: number; text: string }[];
}

function scaleFor(map: MlMap): { px: number; nm: number } {
  const center = map.getCenter();
  const mpp = (40075016.686 * Math.cos((center.lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom());
  const nmPerPx = mpp / 1852;
  const target = nmPerPx * 110;
  const nice = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const nm = nice.reduce((best, n) => (Math.abs(n - target) < Math.abs(best - target) ? n : best), nice[0]);
  return { nm, px: nm / nmPerPx };
}

function markerElement(p: ChartPort, onClick?: (id: string) => void): HTMLElement {
  const el = document.createElement('div');
  el.className = `cm cm-${p.kind} cm-${p.side ?? (p.kind === 'origin' || p.kind === 'home' ? 'left' : 'right')}`;
  const dot = document.createElement('span');
  dot.className = 'cm-dot';
  el.appendChild(dot);
  const label = document.createElement(onClick && p.kind === 'option' ? 'button' : 'span');
  label.className = 'cm-label';
  if (label instanceof HTMLButtonElement) {
    label.type = 'button';
    label.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick?.(p.id);
    });
  }
  const name = document.createElement('span');
  name.className = 'cm-name';
  name.textContent = p.name;
  label.appendChild(name);
  if (p.sub) {
    const sub = document.createElement('span');
    sub.className = 'cm-sub';
    sub.textContent = p.sub;
    label.appendChild(sub);
  }
  el.appendChild(label);
  return el;
}

function boatElement(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'cm-boat';
  el.innerHTML =
    '<span class="cm-boat-wake"></span><svg width="26" height="26" viewBox="-12 -12 24 24" aria-hidden="true"><g class="cm-boat-hull"><path d="M0 -10 C5 -4 5 5 3 9 L-3 9 C-5 5 -5 -4 0 -10Z" fill="var(--ink)" stroke="var(--panel)" stroke-width="1.2"/><path d="M0 -5 L0 6 L3.5 4 Z" fill="#E0442C"/></g></svg>';
  return el;
}

export function Chart({
  ports = [],
  routes = [],
  boat = null,
  fit = null,
  harbours = false,
  interactive = true,
  decor = true,
  globe = false,
  compassStyle,
  scaleStyle,
  onPortClick,
  handle,
  className,
  label = 'Nautical chart',
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [landReady, setLandReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [edges, setEdges] = useState<Edges>({ lats: [], lons: [] });
  const [scale, setScale] = useState<{ px: number; nm: number } | null>(null);
  const markers = useRef(new Map<string, { marker: Marker; sig: string }>());
  const boatMarker = useRef<Marker | null>(null);
  const clickRef = useRef(onPortClick);
  clickRef.current = onPortClick;
  const tooltip = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(
    handle,
    () => ({
      zoomIn: () => mapRef.current?.zoomIn(),
      zoomOut: () => mapRef.current?.zoomOut(),
      flyTo: (pos, zoom) => mapRef.current?.flyTo({ center: pos, zoom: zoom ?? Math.max(mapRef.current.getZoom(), 7), duration: 900 }),
    }),
    [],
  );

  // create the map once
  useEffect(() => {
    if (!container.current) return;
    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: makeStyle(readColors()),
        center: [12.6, 55.6],
        zoom: 6,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        interactive,
        renderWorldCopies: true,
        maxZoom: 12,
        minZoom: 1,
        fadeDuration: 0,
      });
    } catch (e) {
      setFailed('This chart needs WebGL, which is turned off or unavailable here.');
      console.error(e);
      return;
    }
    map.touchZoomRotate?.disableRotation();
    map.keyboard?.disableRotation?.();
    mapRef.current = map;
    const onMove = () => {
      const g = graticule(map);
      (map.getSource('graticule') as GeoJSONSource | undefined)?.setData(g.fc);
      if (decor) {
        const { width, height } = map.getContainer().getBoundingClientRect();
        const b = map.getBounds();
        const lats: Edges['lats'] = [];
        const lons: Edges['lons'] = [];
        const step = g.step;
        for (let y = Math.ceil(b.getSouth() / step) * step; y <= b.getNorth(); y += step) {
          const pt = map.project([b.getEast(), y]);
          if (pt.y > 16 && pt.y < height - 28) lats.push({ y: pt.y, text: fmtDeg(y, 'N', 'S', step) });
        }
        for (let x = Math.ceil(b.getWest() / step) * step; x <= b.getEast(); x += step) {
          const pt = map.project([x, b.getSouth()]);
          if (pt.x > 30 && pt.x < width - 60) lons.push({ x: pt.x, text: fmtDeg(x, 'E', 'W', step) });
        }
        setEdges({ lats, lons });
        setScale(scaleFor(map));
      }
    };
    // regional 1:10m detail, re-clipped when the view leaves the current region
    let region: BBox | null = null;
    let regionBusy = false;
    const updateRegion = () => {
      if (regionBusy || map.getZoom() < HI_ZOOM - 1.2) return;
      const b = map.getBounds();
      const view: BBox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      if (region && view[0] >= region[0] && view[2] <= region[2] && view[1] >= region[1] && view[3] <= region[3]) return;
      const c = map.getCenter();
      const halfLon = Math.max(10, (view[2] - view[0]) * 1.2);
      const halfLat = Math.max(6, (view[3] - view[1]) * 1.2);
      const next: BBox = [c.lng - halfLon, Math.max(-86, c.lat - halfLat), c.lng + halfLon, Math.min(86, c.lat + halfLat)];
      regionBusy = true;
      highDetailLand()
        .then((polys) => {
          if (!mapRef.current) return;
          const { fill, shore } = regionLand(polys, next);
          (map.getSource('land-hi') as GeoJSONSource | undefined)?.setData(fill);
          (map.getSource('shore-hi') as GeoJSONSource | undefined)?.setData(shore);
          region = next;
        })
        .catch((e) => console.warn('coastline detail', e))
        .finally(() => {
          regionBusy = false;
        });
    };
    map.on('load', () => {
      // the theme may have changed while the style was loading
      applyColors(map, readColors());
      setReady(true);
      onMove();
      updateRegion();
      lowDetailLand().then(
        (fc) => {
          (map.getSource('land-lo') as GeoJSONSource | undefined)?.setData(fc);
          map.once('idle', () => setLandReady(true));
        },
        (e) => setFailed(String(e)),
      );
    });
    map.on('moveend', onMove);
    map.on('moveend', updateRegion);
    map.on('resize', onMove);

    // harbour dots: hover name, click to choose
    const tip = document.createElement('div');
    tip.className = 'cm-tip';
    tooltip.current = tip;
    container.current.appendChild(tip);
    for (const layer of HARBOUR_LAYERS) {
      map.on('mouseenter', layer, (e) => {
        map.getCanvas().style.cursor = clickRef.current ? 'pointer' : '';
        const f = e.features?.[0];
        if (!f) return;
        tip.textContent = String(f.properties?.name ?? '');
        tip.style.display = 'block';
      });
      map.on('mousemove', layer, (e) => {
        tip.style.transform = `translate(${e.point.x + 12}px, ${e.point.y - 28}px)`;
      });
      map.on('mouseleave', layer, () => {
        map.getCanvas().style.cursor = '';
        tip.style.display = 'none';
      });
      map.on('click', layer, (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id && clickRef.current) clickRef.current(String(id));
      });
    }

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container.current);

    // follow the theme
    const mo = new MutationObserver(() => {
      if (map.isStyleLoaded()) applyColors(map, readColors());
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      ro.disconnect();
      mo.disconnect();
      for (const { marker } of markers.current.values()) marker.remove();
      markers.current.clear();
      boatMarker.current?.remove();
      boatMarker.current = null;
      tip.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // harbour dots
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!harbours) {
      (map.getSource('harbours') as GeoJSONSource).setData(EMPTY);
      return;
    }
    let cancelled = false;
    loadPorts().then((idx) => {
      if (cancelled) return;
      (map.getSource('harbours') as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: idx.list.map((p) => ({
          type: 'Feature',
          properties: { id: p.id, name: p.name, size: p.size },
          geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        })),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [ready, harbours]);

  // projection
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    try {
      map.setProjection({ type: globe ? 'globe' : 'mercator' });
    } catch (e) {
      console.warn('projection', e);
    }
  }, [ready, globe]);

  // routes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource('routes') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: routes
        .filter((r) => r.coords.length >= 2)
        .map((r) => ({ type: 'Feature', properties: { id: r.id, style: r.style }, geometry: { type: 'LineString', coordinates: r.coords } })),
    });
  }, [ready, routes]);

  // labelled ports
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const seen = new Set<string>();
    for (const p of ports) {
      const key = `${p.kind}:${p.id}`;
      seen.add(key);
      const sig = `${p.pos.join(',')}|${p.side ?? ''}|${p.sub ? 1 : 0}`;
      const existing = markers.current.get(key);
      if (existing && existing.sig === sig) {
        // same place: just refresh the words (e.g. "24.7 nm to go" ticking down)
        const el = existing.marker.getElement();
        const name = el.querySelector('.cm-name');
        const sub = el.querySelector('.cm-sub');
        if (name && name.textContent !== p.name) name.textContent = p.name;
        if (sub && p.sub != null && sub.textContent !== p.sub) sub.textContent = p.sub;
        continue;
      }
      existing?.marker.remove();
      const marker = new maplibregl.Marker({ element: markerElement(p, (id) => clickRef.current?.(id)), anchor: 'center' }).setLngLat(p.pos).addTo(map);
      markers.current.set(key, { marker, sig });
    }
    for (const [key, { marker }] of markers.current) {
      if (!seen.has(key)) {
        marker.remove();
        markers.current.delete(key);
      }
    }
  }, [ready, ports]);

  // the boat
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!boat) {
      boatMarker.current?.remove();
      boatMarker.current = null;
      return;
    }
    if (!boatMarker.current) {
      boatMarker.current = new maplibregl.Marker({ element: boatElement(), anchor: 'center' }).setLngLat(boat.pos).addTo(map);
    }
    boatMarker.current.setLngLat(boat.pos);
    const hull = boatMarker.current.getElement().querySelector('.cm-boat-hull');
    hull?.setAttribute('transform', `rotate(${boat.course.toFixed(1)})`);
  }, [ready, boat]);

  // framing
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !fit || fit.points.length === 0) return;
    const padding = { top: 40, right: 40, bottom: 40, left: 40, ...fit.padding };
    const { width, height } = map.getContainer().getBoundingClientRect();
    // keep padding sane on small windows
    if (padding.left + padding.right > width - 80) {
      padding.right = Math.max(20, Math.min(padding.right, width / 3));
      padding.left = 20;
    }
    if (padding.top + padding.bottom > height - 80) {
      padding.top = 20;
      padding.bottom = Math.max(20, Math.min(padding.bottom, height / 3));
    }
    const duration = fit.animate === false ? 0 : 900;
    if (fit.points.length === 1) {
      map.easeTo({ center: fit.points[0], zoom: fit.zoom ?? 7.5, padding, duration });
    } else {
      const [sw, ne] = bounds(fit.points);
      try {
        map.fitBounds([sw, ne], { padding, maxZoom: fit.maxZoom ?? 9, duration });
      } catch {
        map.easeTo({ center: fit.points[0], zoom: 6, duration });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fit?.key]);

  return (
    <div className={`chart ${className ?? ''}`} role="img" aria-label={label}>
      <div ref={container} className="chart-map" />
      {decor && ready && (
        <div className="chart-decor" aria-hidden="true">
          {edges.lats.map((l) => (
            <span key={'a' + l.text} className="chart-edge lat" style={{ top: l.y }}>
              {l.text}
            </span>
          ))}
          {edges.lons.map((l) => (
            <span key={'o' + l.text} className="chart-edge lon" style={{ left: l.x }}>
              {l.text}
            </span>
          ))}
          <CompassRose style={compassStyle} />
        </div>
      )}
      {decor && scale && (
        <div className="chart-scale" style={scaleStyle} aria-hidden="true">
          <svg width={Math.round(scale.px) + 24} height="30" viewBox={`0 0 ${Math.round(scale.px) + 24} 30`}>
            <rect x="4" y="6" width={scale.px / 2} height="5" fill="var(--ink)" />
            <rect x={4 + scale.px / 2} y="6" width={scale.px / 2} height="5" fill="var(--panel)" stroke="var(--ink)" strokeWidth="1" />
            <rect x="4" y="6" width={scale.px} height="5" fill="none" stroke="var(--ink)" strokeWidth="1" />
            <text x="4" y="25" fontFamily="var(--font-mono)" fontSize="10" fill="var(--ink-3)">
              0
            </text>
            <text x={4 + scale.px / 2} y="25" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="var(--ink-3)">
              {scale.nm / 2}
            </text>
            <text x={4 + scale.px} y="25" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="var(--ink-3)">
              {scale.nm} nm
            </text>
          </svg>
        </div>
      )}
      {!landReady && !failed && <div className="chart-loading">Drawing the chart…</div>}
      {failed && <div className="chart-loading failed">{failed}</div>}
    </div>
  );
}
