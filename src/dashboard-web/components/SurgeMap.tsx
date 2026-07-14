"use client";

/**
 * The world map: a deck.gl deck with two layers on a free token-less Carto dark basemap.
 *
 *   - HeatmapLayer:     background edit-density glow from /heatmap.
 *   - ScatterplotLayer: one dot per active surge, coloured by severity (pickable tooltip).
 *
 * Loaded via next/dynamic({ ssr: false }) — deck.gl/maplibre are browser-only.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "@deck.gl/react";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { ScatterplotLayer, SolidPolygonLayer } from "@deck.gl/layers";
import { WebMercatorViewport } from "@deck.gl/core";
import type { PickingInfo } from "@deck.gl/core";
import { Map } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

import { HeatmapPoint, Surge } from "@/lib/api";
import {
  MAP_HEIGHT,
  MAP_LAT,
  MAP_LON,
  MAP_MIN_ZOOM,
  MAP_STYLE,
  MAP_ZOOM,
  REFRESH_INTERVAL_MS,
  surgeColorRGB,
  TEXT_MID,
} from "@/lib/config";
import { daylightPolygon } from "@/lib/terminator";
import { countryName } from "@/lib/countries";
import MapLegend from "./MapLegend";

interface SurgePoint extends Surge {
  _color: [number, number, number, number];
  _country_name: string;
}

interface MapViewState {
  latitude: number;
  longitude: number;
  zoom: number;
  minZoom?: number;
  pitch?: number;
  bearing?: number;
}

const INITIAL_VIEW_STATE: MapViewState = {
  latitude: MAP_LAT,
  longitude: MAP_LON,
  zoom: MAP_ZOOM,
  minZoom: MAP_MIN_ZOOM,
  pitch: 0,
  bearing: 0,
};

// Web-mercator's latitude limit — the projection is undefined beyond this.
const MAX_LAT = 85.051129;

/**
 * Shift the view centre so the single world always fills the viewport — the
 * camera can't pan past the ±180° / ±MAX_LAT edges into empty space. With world
 * copies turned off, that void is where the antimeridian seam used to show.
 * Longitude is linear in mercator x, so a bound delta maps 1:1 onto the centre;
 * latitude is only approximate per frame but converges as the drag continues.
 */
function clampToWorld(vs: MapViewState, width: number, height: number): MapViewState {
  if (!width || !height) return vs;
  const [west, south, east, north] = new WebMercatorViewport({
    ...vs,
    width,
    height,
  }).getBounds();

  let { longitude, latitude } = vs;

  if (east - west >= 360) longitude = 0; // world narrower than viewport → centre it
  else if (west < -180) longitude += -180 - west;
  else if (east > 180) longitude -= east - 180;

  if (north - south >= 2 * MAX_LAT) latitude = 0;
  else if (south < -MAX_LAT) latitude += -MAX_LAT - south;
  else if (north > MAX_LAT) latitude -= north - MAX_LAT;

  return { ...vs, longitude, latitude };
}

export default function SurgeMap({
  heatmap,
  surges,
}: {
  heatmap: HeatmapPoint[];
  surges: Surge[];
}) {
  // Recompute the daylight overlay every REFRESH_INTERVAL_MS, in step with the
  // dashboard's data poll. The terminator moves ~15°/hour, so 60 s is smooth.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  const daylight = useMemo(() => daylightPolygon(new Date(now)), [now]);

  // Controlled camera: every pan/zoom is clamped so the world can't roll
  // sideways off its edges. Viewport size (needed for the clamp) comes from
  // DeckGL's onResize.
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW_STATE);
  const sizeRef = useRef({ width: 0, height: 0 });

  if (heatmap.length === 0 && surges.length === 0) {
    return (
      <div
        style={{
          height: MAP_HEIGHT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: TEXT_MID,
          fontSize: "0.85rem",
          border: "1px solid #2A2D35",
          borderRadius: 6,
        }}
      >
        Waiting for data…
      </div>
    );
  }

  const surgePoints: SurgePoint[] = surges
    .filter((s) => s.centroid_lat != null && s.centroid_lon != null)
    .map((s) => ({
      ...s,
      _color: surgeColorRGB(s.surge_magnitude ?? 0),
      _country_name: countryName(s.country_code),
    }));

  const layers = [
    // Daylight wash: a faint light fill over the day hemisphere. First in the
    // array so it renders *beneath* the heatmap glow and surge dots.
    new SolidPolygonLayer<[number, number][]>({
      id: "daylight",
      data: [daylight],
      getPolygon: (d) => d,
      getFillColor: [255, 255, 255, 18],
      pickable: false,
    }),
    new HeatmapLayer<HeatmapPoint>({
      id: "heatmap",
      data: heatmap,
      getPosition: (d) => [d.centroid_lon, d.centroid_lat],
      getWeight: (d) => d.total_edits,
      radiusPixels: 60,
      intensity: 1,
      threshold: 0.05,
      opacity: 0.7,
    }),
    new ScatterplotLayer<SurgePoint>({
      id: "surges",
      data: surgePoints,
      getPosition: (d) => [d.centroid_lon as number, d.centroid_lat as number],
      getFillColor: (d) => d._color,
      getRadius: 80_000, // metres; visible at the default world zoom
      radiusMinPixels: 4,
      pickable: true,
      autoHighlight: true,
    }),
  ];

  const getTooltip = ({ object }: PickingInfo<SurgePoint>) => {
    if (!object) return null;
    const mag = (object.surge_magnitude ?? 0).toFixed(1);
    return {
      text: `${object.admin_region}, ${object._country_name}\n${mag}× — ${object.edit_count} edits`,
    };
  };

  return (
    <div style={{ position: "relative", height: MAP_HEIGHT, borderRadius: 6, overflow: "hidden" }}>
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: vs }) =>
          setViewState(clampToWorld(vs as MapViewState, sizeRef.current.width, sizeRef.current.height))
        }
        onResize={({ width, height }) => {
          sizeRef.current = { width, height };
        }}
        controller
        layers={layers}
        getTooltip={getTooltip}
        style={{ position: "absolute", top: "0", left: "0", width: "100%", height: "100%" }}
      >
        <Map reuseMaps mapStyle={MAP_STYLE} renderWorldCopies={false} />
      </DeckGL>
      <MapLegend />
    </div>
  );
}
