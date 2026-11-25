import { defineJsdomPolyfill } from "../setup/define-property.ts";

interface Transform {
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
}

interface Circle {
  kind: "circle";
  x: number;
  y: number;
  radius: number;
}

interface Segment {
  kind: "segment";
  from: { x: number; y: number };
  to: { x: number; y: number };
}

type Mark = Circle | Segment;

type Painted = (Circle & { color: string }) | (Segment & { color: string; width: number });

interface PaintedText {
  text: string;
  x: number;
  y: number;
}

interface PaintedImage {
  source: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Pen {
  transform: Transform;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
}

function ignore() {
  // A canvas call with no effect on what the tests read back.
}

function measure(text: string) {
  return { width: text.length };
}

function distanceToSegment(x: number, y: number, { from, to }: Segment): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = dx * dx + dy * dy;
  const along = length === 0 ? 0 : ((x - from.x) * dx + (y - from.y) * dy) / length;
  const t = Math.max(0, Math.min(1, along));

  return Math.hypot(x - (from.x + t * dx), y - (from.y + t * dy));
}

function covers(mark: Painted, x: number, y: number): boolean {
  return mark.kind === "circle"
    ? Math.hypot(x - mark.x, y - mark.y) <= mark.radius
    : distanceToSegment(x, y, mark) <= mark.width / 2;
}

function rgbaOf(color: string): Array<number> {
  const hex = /^#(?<rgb>[\da-f]{6})$/iu.exec(color)?.groups?.rgb;

  if (hex === undefined) {
    return [0, 0, 0, 0];
  }

  return [...[0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)), 255];
}

/**
 * A 2D context that keeps what the last frame painted instead of pixels: the circles, lines,
 * text and images, in canvas pixels. Reading a pixel returns the colour of the last mark over it,
 * which is all force-graph needs to find the point or connection under the pointer.
 */
class TestCanvasContext {
  readonly canvas: HTMLCanvasElement;
  readonly texts: Array<PaintedText> = [];
  readonly images: Array<PaintedImage> = [];
  globalAlpha = 1;
  font = "";
  textAlign = "start";
  textBaseline = "alphabetic";
  lineCap = "butt";
  lineJoin = "miter";
  private readonly marks: Array<Painted> = [];
  private path: Array<Mark> = [];
  private cursor = { x: 0, y: 0 };
  private pen: Pen = {
    transform: { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0 },
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
  };
  private readonly saved: Array<Pen> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  get fillStyle() {
    return this.pen.fillStyle;
  }

  set fillStyle(color: string) {
    this.pen.fillStyle = color;
  }

  get strokeStyle() {
    return this.pen.strokeStyle;
  }

  set strokeStyle(color: string) {
    this.pen.strokeStyle = color;
  }

  get lineWidth() {
    return this.pen.lineWidth;
  }

  set lineWidth(width: number) {
    this.pen.lineWidth = width;
  }

  save() {
    this.saved.push({ ...this.pen, transform: { ...this.pen.transform } });
  }

  restore() {
    this.pen = this.saved.pop() ?? this.pen;
  }

  setTransform(
    scaleX: number,
    _skewY: number,
    _skewX: number,
    scaleY: number,
    x: number,
    y: number,
  ) {
    this.pen.transform = { scaleX, scaleY, translateX: x, translateY: y };
  }

  translate(x: number, y: number) {
    const { transform } = this.pen;
    transform.translateX += transform.scaleX * x;
    transform.translateY += transform.scaleY * y;
  }

  scale(x: number, y: number) {
    this.pen.transform.scaleX *= x;
    this.pen.transform.scaleY *= y;
  }

  // force-graph clears the whole canvas before each frame.
  clearRect() {
    this.marks.length = 0;
    this.texts.length = 0;
    this.images.length = 0;
  }

  beginPath() {
    this.path = [];
  }

  moveTo(x: number, y: number) {
    this.cursor = this.toCanvas(x, y);
  }

  lineTo(x: number, y: number) {
    const to = this.toCanvas(x, y);
    this.path.push({ kind: "segment", from: this.cursor, to });
    this.cursor = to;
  }

  arc(x: number, y: number, radius: number) {
    this.path.push({
      kind: "circle",
      ...this.toCanvas(x, y),
      radius: radius * this.pen.transform.scaleX,
    });
  }

  fill() {
    for (const mark of this.path) {
      if (mark.kind === "circle") {
        this.marks.push({ ...mark, color: this.pen.fillStyle });
      }
    }
  }

  stroke() {
    const width = this.pen.lineWidth * this.pen.transform.scaleX;

    for (const mark of this.path) {
      if (mark.kind === "segment") {
        this.marks.push({ ...mark, color: this.pen.strokeStyle, width });
      }
    }
  }

  // Dashes and clipping never change which mark a pixel reads back.
  readonly setLineDash = ignore;
  readonly clip = ignore;

  fillText(text: string, x: number, y: number) {
    this.texts.push({ text, ...this.toCanvas(x, y) });
  }

  // The outline only makes the filled text readable.
  readonly strokeText = ignore;
  readonly measureText = measure;

  drawImage(image: HTMLImageElement, ...area: Array<number>) {
    const [x, y, width, height] = area.slice(-4);
    const { scaleX, scaleY } = this.pen.transform;

    this.images.push({
      source: image.getAttribute("src") ?? "",
      ...this.toCanvas(x, y),
      width: width * scaleX,
      height: height * scaleY,
    });
  }

  getImageData(x: number, y: number) {
    const mark = this.marks.findLast((painted) => covers(painted, x, y));

    return { data: new Uint8ClampedArray(rgbaOf(mark?.color ?? "")) };
  }

  private toCanvas(x: number, y: number) {
    const { scaleX, scaleY, translateX, translateY } = this.pen.transform;

    return { x: translateX + scaleX * x, y: translateY + scaleY * y };
  }
}

const contexts = new Map<HTMLCanvasElement, TestCanvasContext>();

/** jsdom has no 2D canvas: every canvas gets a context that remembers what it painted. */
export function installCanvas2d() {
  defineJsdomPolyfill(globalThis.HTMLCanvasElement.prototype, "getContext", {
    value(this: HTMLCanvasElement) {
      let context = contexts.get(this);

      if (context === undefined) {
        context = new TestCanvasContext(this);
        contexts.set(this, context);
      }

      return context;
    },
  });
}

/** The contexts of the canvases on the page, leaving out off-screen ones such as hit canvases. */
function shownCanvases(): Array<TestCanvasContext> {
  return [...contexts.values()].filter((context) => context.canvas.isConnected);
}

/** Where the last frame painted `text`, in canvas pixels, with the canvas it is on. */
export function findPaintedText(text: string) {
  return shownCanvases()
    .flatMap(({ canvas, texts }) =>
      texts.filter((painted) => painted.text === text).map(({ x, y }) => ({ canvas, x, y })),
    )
    .at(-1);
}

export function paintedImages(): Array<PaintedImage> {
  return shownCanvases().flatMap((context) => context.images);
}
