"use client";

/**
 * The world map: a deck.gl deck with two layers on a free token-less Carto dark basemap.
 *
 *   - HeatmapLayer:     background edit-density glow from /heatmap.
 *   - ScatterplotLayer: one dot per active surge, coloured by severity (pickable tooltip).
 *
 * Loaded via next/dynamic({ ssr: false }) — deck.gl/maplibre are browser-only.
 */

import DeckGL from "@deck.gl/react";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { Map } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

import { HeatmapPoint, Surge } from "@/lib/api";
import {
  MAP_HEIGHT,
  MAP_LAT,
  MAP_LON,
  MAP_STYLE,
  MAP_ZOOM,
  surgeColorRGB,
  TEXT_MID,
} from "@/lib/config";
import { countryName } from "@/lib/countries";
import MapLegend from "./MapLegend";

interface SurgePoint extends Surge {
  _color: [number, number, number, number];
  _country_name: string;
}

const INITIAL_VIEW_STATE = {
  latitude: MAP_LAT,
  longitude: MAP_LON,
  zoom: MAP_ZOOM,
  pitch: 0,
  bearing: 0,
};

export default function SurgeMap({
  heatmap,
  surges,
}: {
  heatmap: HeatmapPoint[];
  surges: Surge[];
}) {
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
        initialViewState={INITIAL_VIEW_STATE}
        controller
        layers={layers}
        getTooltip={getTooltip}
        style={{ position: "absolute", top: "0", left: "0", width: "100%", height: "100%" }}
      >
        <Map reuseMaps mapStyle={MAP_STYLE} />
      </DeckGL>
      <MapLegend />
    </div>
  );
}
