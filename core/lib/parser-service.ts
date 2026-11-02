import type { StoryVersion } from "../instagram-types.ts";

export function getLargestVersion<T extends StoryVersion>(
  versions: Array<T> | null | undefined,
): T | null {
  if (!versions || versions.length === 0) {
    return null;
  }

  let [largest] = versions;

  for (const version of versions) {
    const largestArea = (largest.width ?? 0) * (largest.height ?? 0);
    const versionArea = (version.width ?? 0) * (version.height ?? 0);

    if (versionArea > largestArea) {
      largest = version;
    }
  }

  return largest;
}
