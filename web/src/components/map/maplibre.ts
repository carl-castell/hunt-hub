import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

/*
 * MapLibre 6 runs its data processing (e.g. GeoJSON) in a separate worker
 * file. By default it looks for that file next to its own code, which Vite
 * moves during bundling ("Worker failed to load"). Importing the worker with
 * `?url` makes Vite ship the file and gives us its real URL, in dev and in
 * the production build. Import maplibre-gl only through this module.
 */
maplibregl.setWorkerUrl(workerUrl)

export { maplibregl }
