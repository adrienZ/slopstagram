import ForceGraph from "force-graph";
import { pickAt, type Painted } from "./mention-graph-hit-test.ts";
import type { GraphLink, GraphNode } from "./mention-graph-drawing.ts";

export type Graph = ForceGraph<GraphNode, GraphLink>;

/** Writes the pixel force-graph expects: the object's own colour, or nothing for the background. */
function toPixel(
  canvas: CanvasRenderingContext2D,
  picked: Painted<GraphNode> | Painted<GraphLink> | null,
): ImageData {
  const pixel = canvas.createImageData(1, 1);
  const color = picked?.__indexColor;

  if (color !== undefined) {
    const channels = [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16));
    pixel.data.set([...channels, 255]);
  }

  return pixel;
}

/**
 * Makes force-graph find what is under the pointer without trusting a canvas readback. It reads
 * back one pixel of a hidden canvas where every point and connection has its own colour, but
 * Brave and other privacy browsers add noise to every readback: the colour matches nothing and
 * nothing can be selected. The hidden canvas is not reachable, so it is caught as force-graph
 * creates it, and its readback is answered from the geometry of the graph instead.
 */
export function createGraph(container: HTMLElement): Graph {
  const canvasPrototype = globalThis.HTMLCanvasElement.prototype;
  // oxlint-disable-next-line typescript/unbound-method -- called back with its canvas below.
  const nativeGetContext = canvasPrototype.getContext;
  const caught = new Map<"hiddenCanvas", CanvasRenderingContext2D>();

  Object.defineProperty(canvasPrototype, "getContext", {
    configurable: true,
    writable: true,
    value(this: HTMLCanvasElement, contextId: string, options?: CanvasRenderingContext2DSettings) {
      const context = nativeGetContext.call(this, contextId, options);

      if (context !== null && "getImageData" in context && options?.willReadFrequently === true) {
        caught.set("hiddenCanvas", context);
      }

      return context;
    },
  });

  let graph: Graph;

  try {
    graph = new ForceGraph<GraphNode, GraphLink>(container);
  } finally {
    Object.defineProperty(canvasPrototype, "getContext", {
      configurable: true,
      writable: true,
      value: nativeGetContext,
    });
  }

  const canvas = caught.get("hiddenCanvas");

  if (canvas !== undefined) {
    // oxlint-disable-next-line typescript/unbound-method -- called back with its canvas below.
    const readBack = canvas.getImageData;

    Object.defineProperty(canvas, "getImageData", {
      configurable: true,
      value(x: number, y: number, width: number, height: number) {
        if (width !== 1 || height !== 1) {
          return readBack.call(canvas, x, y, width, height);
        }

        const pixelRatio = globalThis.devicePixelRatio;
        const position = graph.screen2GraphCoords(x / pixelRatio, y / pixelRatio);

        return toPixel(canvas, pickAt(graph.graphData(), position, graph.zoom()));
      },
    });
  }

  return graph;
}
