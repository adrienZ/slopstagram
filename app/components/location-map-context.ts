import { createContext, lazy } from "react";
import type { ComponentType } from "react";
import type { LocationMapCanvasProps } from "./location-map-canvas.tsx";

/** The map the place explorer draws, which tests replace since MapLibre needs WebGL. */
export const LocationMapContext = createContext<ComponentType<LocationMapCanvasProps>>(
  lazy(async () => await import("./location-map-canvas.tsx")),
);
