/**
 * Stands in for the macOS-only `mac-ocr` package in the jsdom project, where Vite resolves every
 * import at transform time and CI runs on Linux without the package. No UI test recognizes text.
 */
export function ocr(): never {
  throw new Error("mac-ocr is not available in UI tests");
}
