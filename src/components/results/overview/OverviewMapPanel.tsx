import type { HeatSpot, Partner } from "@shared/types";
import { divIcon } from "leaflet";
import { useEffect, useMemo } from "react";
import { AttributionControl, Circle, MapContainer, Marker, Tooltip, ZoomControl, useMap } from "react-leaflet";
import { ChartCard, DataTable } from "@/components/results/overview/ChartCard";
import { bindPartnerPointer, type TipLine } from "@/components/results/overview/OverviewTip";
import { OpenFreeMapLayer } from "@/components/results/OpenFreeMapLayer";
import { kindLabel } from "@/lib/overviewModel";
import { cn } from "@/lib/cn";

function pinIcon(partner: Partner, selected: boolean) {
  const lift = partner.popularityLift ?? 0;
  const intensity = Math.max(0.3, Math.min(1, 0.4 + Math.abs(lift) * 2 + partner.matchScore / 200));
  const size = Math.round(12 + intensity * 12);
  return divIcon({
    className: "ov-map-pin",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:999px;background:#4F5BFF;opacity:${0.55 + intensity * 0.45};border:2px solid white;box-shadow:0 1px 4px rgba(20,21,26,.28)${selected ? ";outline:2px solid #14151A;outline-offset:2px" : ""}"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FitBounds({ partners }: { partners: Partner[] }) {
  const map = useMap();
  useEffect(() => {
    const pts = partners
      .map((p) => p.venueFacts)
      .filter((v): v is NonNullable<typeof v> => Boolean(v));
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setView([pts[0]!.lat, pts[0]!.lon], 13);
      return;
    }
    const lats = pts.map((p) => p.lat);
    const lons = pts.map((p) => p.lon);
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ],
      { padding: [40, 40] },
    );
  }, [map, partners]);
  return null;
}

export function OverviewMapPanel({
  partners,
  cityCenter,
  cityZoom,
  heatmapSpots,
  liftOn,
  onLiftToggle,
  selectedId,
  hoverId,
  setHover,
  select,
}: {
  partners: Partner[];
  cityCenter: [number, number];
  cityZoom: number;
  heatmapSpots: HeatSpot[];
  liftOn: boolean;
  onLiftToggle: (v: boolean) => void;
  selectedId: string | null;
  hoverId: string | null;
  setHover: (id: string | null) => void;
  select: (id: string | null) => void;
}) {
  const located = useMemo(
    () => partners.filter((p) => Boolean(p.venueFacts)),
    [partners],
  );
  const remote = useMemo(
    () => partners.filter((p) => !p.venueFacts),
    [partners],
  );

  const near = located.filter((p) => {
    const d = p.venueFacts?.distanceM;
    return typeof d === "number" && d <= 3000;
  }).length;

  const title =
    located.length > 0
      ? `Where your crowd is`
      : `Partners without a fixed pin`;
  const subtitle =
    located.length > 0
      ? `${near} of ${located.length} local partners are within 3 km of you.${
          remote.length
            ? ` ${remote.length} brand${remote.length === 1 ? " has" : "s have"} no fixed location, so ${remote.length === 1 ? "it sits" : "they sit"} below the map.`
            : ""
        }`
      : remote.length
        ? `${remote.length} partner${remote.length === 1 ? "" : "s"} have no map location.`
        : "No partners with locations in this filter.";

  if (located.length === 0 && remote.length === 0) return null;

  return (
    <ChartCard
      id="c-map"
      title={title}
      subtitle={subtitle}
      legend={
        <div className="ov-key">
          <span>
            <i style={{ background: "var(--ov-blue)" }} />
            Partner pin
          </span>
          <span>
            <i className="lens" />
            Taste lift: where your crowd gathers
          </span>
        </div>
      }
      chart={
        <div>
          {located.length > 0 ? (
            <div className="ov-mapbox">
              <div className="ov-mapctl">
                <label className="ov-pillc ov-sw">
                  <input
                    type="checkbox"
                    checked={liftOn}
                    onChange={(e) => onLiftToggle(e.target.checked)}
                  />
                  <i aria-hidden="true" />
                  Taste lift
                </label>
              </div>
              <MapContainer
                center={cityCenter}
                zoom={cityZoom}
                zoomControl={false}
                attributionControl={false}
                className="ov-leaflet"
                style={{ height: "100%", width: "100%" }}
              >
                <ZoomControl position="bottomright" />
                <AttributionControl position="bottomleft" prefix={false} />
                <OpenFreeMapLayer />
                <FitBounds partners={located} />
                {liftOn
                  ? heatmapSpots.map((spot) => (
                      <Circle
                        key={spot.id}
                        center={[spot.lat, spot.lng]}
                        radius={400 + 700 * Math.max(spot.overlap, spot.intensityA)}
                        pathOptions={{
                          stroke: false,
                          fillColor: "#6B3FA0",
                          fillOpacity: 0.12 + 0.34 * Math.max(spot.overlap, spot.intensityA),
                        }}
                      />
                    ))
                  : null}
                {located.map((p) => {
                  const vf = p.venueFacts!;
                  return (
                    <Marker
                      key={p.id}
                      position={[vf.lat, vf.lon]}
                      icon={pinIcon(p, selectedId === p.id || hoverId === p.id)}
                      eventHandlers={{
                        click: () => select(p.id),
                        mouseover: () => setHover(p.id),
                        mouseout: () => setHover(null),
                      }}
                      opacity={hoverId && hoverId !== p.id ? 0.35 : 1}
                    >
                      <Tooltip>
                        {p.name} · {Math.round(p.matchScore)} overlap
                      </Tooltip>
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>
          ) : null}
          {remote.length > 0 ? (
            <div className="ov-brands">
              <span>No fixed location:</span>
              {remote.map((p) => {
                const bind = bindPartnerPointer(p.id, {
                  setHover,
                  select,
                  lines: (): TipLine[] => [
                    { className: "v", text: `${Math.round(p.matchScore)} overlap` },
                    { className: "l", text: `${p.name} · ${kindLabel(p.kind)}` },
                    { className: "l", text: "No fixed location" },
                  ],
                });
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={cn(
                      hoverId === p.id && "hl",
                      selectedId === p.id && "sel",
                    )}
                    {...bind}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      }
      table={
        <DataTable
          head={["Partner", "Distance", "Area", "Overlap"]}
          rowIds={partners.map((p) => p.id)}
          selectedId={selectedId}
          hoverId={hoverId}
          onRowFocus={setHover}
          onRowSelect={select}
          rows={partners.map((p) => [
            p.name,
            typeof p.venueFacts?.distanceM === "number"
              ? `${(p.venueFacts.distanceM / 1000).toFixed(1)} km`
              : "No fixed location",
            p.venueFacts?.neighbourhood ?? p.locationLabel ?? (p.local ? "Local" : "Online"),
            String(Math.round(p.matchScore)),
          ])}
        />
      }
    />
  );
}
