import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getStoryTrayUiSortPosition,
  parseStoriesTrayReport,
} from "../scripts/lib/parser-service.js";
import type { StoriesReport } from "../scripts/lib/types.js";
import reelsTrayFixture from "./fixtures/xdt_api__v1__feed__reels_tray.json" with { type: "json" };

const report = reelsTrayFixture as StoriesReport;

describe("parseStoriesTrayReport", () => {
  test("preserves the captured Instagram tray order", () => {
    const parsedTray = parseStoriesTrayReport(report);

    assert.equal(parsedTray.length, 44);
    assert.deepEqual(
      parsedTray.slice(0, 5).map((entry) => ({
        items: entry.items,
        username: entry.username,
      })),
      [
        {
          items: [
            {
              media_ids: [
                "8888888888888888882",
                "8888888888888888883",
                "8888888888888888884",
                "8888888888888888885",
              ],
            },
          ],
          username: "user_008",
        },
        {
          items: [
            {
              media_ids: ["8888888888888888887"],
            },
          ],
          username: "user_022",
        },
        {
          items: [
            {
              media_ids: [
                "8888888888888888889",
                "8888888888888888810",
                "8888888888888888811",
                "8888888888888888812",
                "8888888888888888813",
              ],
            },
          ],
          username: "user_006",
        },
        {
          items: [
            {
              media_ids: [
                "8888888888888888814",
                "8888888888888888815",
              ],
            },
          ],
          username: "user_020",
        },
        {
          items: [
            {
              media_ids: [
                "8888888888888888817",
                "8888888888888888818",
              ],
            },
          ],
          username: "user_042",
        },
      ],
    );
    assert.deepEqual(parsedTray.map((entry) => entry.username), [
      "user_008",
      "user_022",
      "user_006",
      "user_020",
      "user_042",
      "user_005",
      "user_028",
      "user_040",
      "user_027",
      "user_007",
      "user_004",
      "user_038",
      "user_033",
      "user_024",
      "user_036",
      "user_010",
      "user_032",
      "user_037",
      "user_035",
      "user_016",
      "user_013",
      "user_002",
      "user_026",
      "user_043",
      "user_001",
      "user_014",
      "user_012",
      "user_029",
      "user_023",
      "user_041",
      "user_019",
      "user_031",
      "user_003",
      "user_017",
      "user_044",
      "user_011",
      "user_039",
      "user_018",
      "user_015",
      "user_030",
      "user_009",
      "user_021",
      "user_034",
      "user_025",
    ]);
  });
});

describe("getStoryTrayUiSortPosition", () => {
  test("prefers seen_ranked_position over ranked_position when they diverge", () => {
    const customReport: StoriesReport = {
      xdt_api__v1__feed__reels_tray: {
        tray: [
          {
            id: "ranked-first",
            media_ids: ["1"],
            ranked_position: 1,
            seen_ranked_position: 2,
            user: { username: "ranked-first" },
          },
          {
            id: "seen-first",
            media_ids: ["2"],
            ranked_position: 2,
            seen_ranked_position: 1,
            user: { username: "seen-first" },
          },
        ],
      },
    };

    assert.equal(
      getStoryTrayUiSortPosition(
        customReport.xdt_api__v1__feed__reels_tray?.tray?.[0] ?? {
          id: "missing",
        },
      ),
      2,
    );
    assert.deepEqual(parseStoriesTrayReport(customReport), [
      {
        items: [
          {
            media_ids: ["2"],
          },
        ],
        username: "seen-first",
      },
      {
        items: [
          {
            media_ids: ["1"],
          },
        ],
        username: "ranked-first",
      },
    ]);
  });
});
