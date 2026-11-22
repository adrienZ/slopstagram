import { describe, expect, it } from "vitest";
import { getLargestVersion } from "@@/core/domains/instagram/story-parser.ts";
import type { StoryVersion } from "@@/core/domains/instagram/instagram-types.ts";

describe(getLargestVersion, () => {
  it("returns the candidate with the largest area", () => {
    const versions: Array<StoryVersion> = [
      { height: 100, url: "small", width: 50 },
      { height: 90, url: "medium", width: 100 },
      { height: 200, url: "large", width: 80 },
    ];

    expect(getLargestVersion(versions)).toStrictEqual({
      height: 200,
      url: "large",
      width: 80,
    });
  });

  it("returns null for empty input", () => {
    expect(getLargestVersion([])).toBeNull();
    expect(getLargestVersion(null)).toBeNull();
  });
});
