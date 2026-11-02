import { describe, expect, test } from "vitest";
import { getLargestVersion } from "../sdk/lib/parser-service.ts";
import type { StoryVersion } from "../sdk/instagram-types.ts";

describe("getLargestVersion", () => {
  test("returns the candidate with the largest area", () => {
    const versions: Array<StoryVersion> = [
      { height: 100, url: "small", width: 50 },
      { height: 90, url: "medium", width: 100 },
      { height: 200, url: "large", width: 80 },
    ];

    expect(getLargestVersion(versions)).toEqual({
      height: 200,
      url: "large",
      width: 80,
    });
  });

  test("returns null for empty input", () => {
    expect(getLargestVersion([])).toBeNull();
    expect(getLargestVersion(null)).toBeNull();
  });
});
