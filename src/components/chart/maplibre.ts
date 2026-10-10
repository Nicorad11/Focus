// MapLibre's CSP build loads its worker from a plain file instead of a blob: URL, so it runs under the
// strict content security policies of the desktop shell and of hosted previews alike.
import maplibregl from 'maplibre-gl/dist/maplibre-gl-csp';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-csp-worker.js?url';
import 'maplibre-gl/dist/maplibre-gl.css';

maplibregl.setWorkerUrl(new URL(workerUrl, document.baseURI).href);

export default maplibregl;
