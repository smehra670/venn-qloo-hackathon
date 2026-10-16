/**
 * MapLibre + Vite: the default worker URL is resolved from import.meta.url
 * inside the prebundled package, which doesn't sit next to maplibre-gl-worker.mjs.
 * Point it at the real worker asset before any Map is constructed.
 */
import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

maplibregl.setWorkerUrl(maplibreWorkerUrl);

export { maplibregl };
export default maplibregl;
