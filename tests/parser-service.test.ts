import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { getLargestVersion } from "../sdk/lib/parser-service.ts";
import type { StoryVersion } from "../sdk/instagram-types.ts";

describe("getLargestVersion", () => {
  test("returns the candidate with the largest area", () => {
    const versions: Array<StoryVersion> = [
      { height: 100, url: "small", width: 50 },
      { height: 90, url: "medium", width: 100 },
      { height: 200, url: "large", width: 80 },
    ];

    assert.deepEqual(getLargestVersion(versions), {
      height: 200,
      url: "large",
      width: 80,
    });
  });

  test("returns null for empty input", () => {
    assert.equal(getLargestVersion([]), null);
    assert.equal(getLargestVersion(null), null);
  });
});
