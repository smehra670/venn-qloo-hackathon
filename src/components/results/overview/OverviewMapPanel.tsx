import type { HeatSpot, Partner } from "@shared/types";
import { divIcon } from "leaflet";
import { useEffect, useMemo } from "react";
import { AttributionControl, CircleMarker, MapContainer, Marker, Tooltip, ZoomControl, useMap } from "react-leaflet";
import { ChartCard, DataTable } from "@/components/results/overview/ChartCard";
import { bindPartnerPointer, type TipLine } from "@/components/results/overview/OverviewTip";
import { OpenFreeMapLayer } from "@/components/results/OpenFreeMapLayer";
import { partnerOpacity, tasteTipLine, useTasteFocus } from "@/components/results/overview/tasteFocus";
import { PARTNER_BLUE, kindLabel } from "@/lib/overviewModel";
import { cn } from "@/lib/cn";

function pinIcon(partner: Partner, selected: boolean) {
  const lift = partner.popularityLift ?? 0;
  const intensity = Math.max(0.3, Math.min(1, 0.4 + Math.abs(lift) * 2 + partner.matchScore / 200));
  const size = Math.round((12 + intensity * 10) * rootScale());
  return divIcon({
    className: "ov-map-pin",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:999px;background:${PARTNER_BLUE};opacity:${0.55 + intensity * 0.45};border:2px solid white;box-shadow:0 1px 4px rgba(20,21,26,.28)${selected ? ";outline:2px solid #14151A;outline-offset:2px" : ""}"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Root font size relative to 16px, so px-sized map marks follow the fluid UI scale. */
function rootScale(): number {
  return (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16;
}

/**
 * Leaflet sizes its tile/marker panes once, at mount. If the card's own box later changes size —
 * a breakpoint, a filter reflowing the grid, or (on mobile) the browser's address bar collapsing
 * as the page scrolls — the map doesn't know, and its panes stay the old size: tiles then render
 * past the card's rounded corners and visually sit on top of whatever is now underneath. Watching
 * the container and calling `invalidateSize()` keeps Leaflet's internal size in sync with the DOM.
 */
function MapResize() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(container);
    return () => ro.disconnect();
  }, [map]);
  return null;
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
  const focus = useTasteFocus();
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
            <i style={{ background: PARTNER_BLUE }} />
            Partner pin
          </span>
          <span>
            <i className="lens" />
            Taste lift: where your crowd gathers
          </span>
        </div>
      }
      chart={
        <div className="ov-mapwrap">
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
                <MapResize />
                <FitBounds partners={located} />
                {liftOn
                  ? heatmapSpots.map((spot) => {
                      const strength = Math.min(1, Math.max(spot.overlap, spot.intensityA));
                      return (
                        // Pixel radius (not metres) so the glow stays a soft dot at any zoom level.
                        <CircleMarker
                          key={spot.id}
                          center={[spot.lat, spot.lng]}
                          radius={(11 + 15 * strength) * rootScale()}
                          pathOptions={{
                            stroke: false,
                            fillColor: "#6B3FA0",
                            fillOpacity: 0.1 + 0.2 * strength,
                          }}
                          interactive={false}
                        />
                      );
                    })
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
                      opacity={partnerOpacity(p.id, { hoverId, focus, hoverDim: 0.35, tasteDim: 0.16 })}
                    >
                      <Tooltip>
                        {p.name} · {Math.round(p.matchScore)} overlap
                        {tasteTipLine(focus, p) ? (
                          <>
                            <br />
                            {tasteTipLine(focus, p)!.text}
                          </>
                        ) : null}
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
                  lines: (): TipLine[] => {
                    const lines: TipLine[] = [
                      { className: "v", text: `${Math.round(p.matchScore)} overlap` },
                      { className: "l", text: `${p.name} · ${kindLabel(p.kind)}` },
                      { className: "l", text: "No fixed location" },
                    ];
                    const taste = tasteTipLine(focus, p);
                    return taste ? [...lines, taste] : lines;
                  },
                });
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={cn(
                      hoverId === p.id && "hl",
                      selectedId === p.id && "sel",
                      focus.taste && !focus.members.has(p.id) && hoverId !== p.id && "ov-tm-off",
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
