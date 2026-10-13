import type { HeatSpot } from "@shared/types";
import { divIcon } from "leaflet";
import { Fragment, useEffect, useState } from "react";
import { Circle, MapContainer, Marker, TileLayer, Tooltip, ZoomControl, useMap } from "react-leaflet";
import { Skeleton } from "@/components/ui/Skeleton";
import { useVenn } from "@/store/useVenn";

function FlyTo({ spot }: { spot: HeatSpot | null }) {
  const map = useMap();
  useEffect(() => {
    if (!spot) return;
    map.flyTo([spot.lat, spot.lng], 13, { duration: 0.6 });
  }, [spot, map]);
  return null;
}

export function MapView() {
  const result = useVenn((state) => state.result);
  const loadHeatmap = useVenn((state) => state.loadHeatmap);
  const heatmaps = useVenn((state) => state.heatmaps);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const defaultId = result?.topPicks.find((pick) => pick.role === "best_overall")?.partnerId ?? result?.partners[0]?.id ?? null;
  const currentId = partnerId ?? defaultId;
  const partner = result?.partners.find((item) => item.id === currentId) ?? null;
  const heatmap = currentId ? heatmaps[currentId] : undefined;
  const active = heatmap?.spots.find((spot) => spot.id === activeId) ?? null;

  useEffect(() => {
    if (!currentId || currentId in heatmaps) return;
    void loadHeatmap(currentId);
  }, [currentId, heatmaps, loadHeatmap]);

  if (!result) return null;
  if (!result.city?.hasLocalData) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <p className="max-w-md font-serif text-3xl leading-tight">
          Map preview needs local place data for {result.input.city.trim() || "this city"}.
        </p>
      </div>
    );
  }
  const options = [...result.partners].sort((a, b) => b.matchScore - a.matchScore).slice(0, 8);

  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)] gap-3 p-4 pb-24 md:grid-cols-[minmax(0,1fr)_280px] md:grid-rows-1 md:pb-4">
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-ink-soft">
            Partner
            <select
              className="ml-2 rounded-full bg-card px-3 py-1 text-ink"
              value={currentId ?? ""}
              onChange={(event) => {
                setPartnerId(event.target.value);
                setActiveId(null);
              }}
            >
              {options.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <p className="text-sm text-ink-soft">Where does your crowd overlap with {partner?.name ?? "this partner"}?</p>
        </div>
        <div className="min-h-[320px] overflow-hidden rounded-[20px] border border-line">
          {heatmap === undefined ? <Skeleton className="h-full min-h-[320px] rounded-none" /> : null}
          {heatmap === null ? (
            <p className="p-6 text-ink-soft">No neighbourhood heatmap came back for this partner. Try another partner or city.</p>
          ) : null}
          {heatmap ? (
            <MapContainer center={heatmap.city.center} zoom={heatmap.city.zoom} zoomControl={false} className="h-full min-h-[320px]">
              <ZoomControl position="bottomright" />
              <TileLayer
                attribution='&copy; OpenStreetMap contributors &copy; CARTO'
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              />
              <FlyTo spot={active} />
              {heatmap.spots.map((spot) => (
                <Fragment key={spot.id}>
                  <Circle
                    center={[spot.lat, spot.lng]}
                    radius={400 + 700 * spot.intensityA}
                    pathOptions={{ stroke: false, fillColor: "#FF6B57", fillOpacity: 0.1 + 0.35 * spot.intensityA, className: "venn-glow" }}
                  />
                  <Circle
                    center={[spot.lat, spot.lng]}
                    radius={400 + 700 * spot.intensityB}
                    pathOptions={{ stroke: false, fillColor: "#4F5BFF", fillOpacity: 0.1 + 0.35 * spot.intensityB, className: "venn-glow" }}
                  />
                  {spot.rank ? (
                    <Marker
                      position={[spot.lat, spot.lng]}
                      icon={divIcon({ className: "venn-rank", html: String(spot.rank), iconSize: [28, 28], iconAnchor: [14, 14] })}
                    >
                      <Tooltip>{spot.name}. {spot.why}</Tooltip>
                    </Marker>
                  ) : null}
                </Fragment>
              ))}
            </MapContainer>
          ) : null}
        </div>
      </div>
      <ol className="space-y-2 overflow-auto">
        {(heatmap?.spots ?? [])
          .slice()
          .sort((a, b) => b.overlap - a.overlap)
          .map((spot) => (
            <li key={spot.id}>
              <button
                type="button"
                onClick={() => setActiveId(spot.id)}
                className={`w-full rounded-2xl border px-3 py-3 text-left ${activeId === spot.id ? "border-blue bg-blue-soft" : "border-line bg-card"}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{spot.rank ? `${spot.rank}. ` : ""}{spot.name}</span>
                  <span className="font-mono text-xs text-ink-soft">{Math.round(spot.overlap * 100)}</span>
                </span>
                <span className="mt-1 block text-sm text-ink-soft">{spot.why}</span>
              </button>
            </li>
          ))}
      </ol>
    </div>
  );
}
