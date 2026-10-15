import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect } from "react";
import { useMap } from "react-leaflet";

/** OpenFreeMap vector basemap (Positron) via MapLibre inside Leaflet. */
const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> © <a href="https://openmaptiles.org" target="_blank" rel="noreferrer">OpenMapTiles</a> · Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

export function OpenFreeMapLayer() {
  const map = useMap();

  useEffect(() => {
    const layer = maplibreGL({
      style: OPENFREEMAP_STYLE,
      interactive: false,
      attributionControl: false,
    });
    layer.addTo(map);
    map.attributionControl?.addAttribution(ATTRIBUTION);
    return () => {
      map.attributionControl?.removeAttribution(ATTRIBUTION);
      map.removeLayer(layer);
    };
  }, [map]);

  return null;
}
