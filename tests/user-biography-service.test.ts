import assert from "node:assert/strict";
import { test } from "node:test";
import type { StoryTrayEntry } from "../sdk/lib/types.ts";
import { createManifestUsers, createOutputUsers } from "../sdk/story-output-service.ts";
import { enrichTrayBiographies } from "../sdk/user-biography-service.ts";
import { createClient, createMockLogger, response } from "./mock-helpers.ts";

function trayEntry(username: string, pk = username): StoryTrayEntry {
  return { id: pk, media_ids: [], user: { pk, username } };
}

test("fetches one biography per account and carries it into report users", async () => {
  const tray = [trayEntry("one"), trayEntry("one"), trayEntry("two")];
  const client = createClient(tray, []);
  const calls: Array<string> = [];
  await enrichTrayBiographies(
    tray,
    {
      ...client,
      getUserProfile: async (username) => {
        calls.push(username);
        return response({
          biography: `Bio ${username}`,
          full_name: null,
          id: username,
          pk: username,
          username,
        });
      },
    },
    createMockLogger(),
  );
  assert.deepEqual(calls, ["one", "two"]);
  assert.deepEqual(
    tray.map((entry) => entry.user.biography),
    ["Bio one", "Bio one", "Bio two"],
  );
  const manifestUsers = createManifestUsers(tray, new Map(), new Map());
  assert.equal(manifestUsers[0]?.biography, "Bio one");
  assert.deepEqual(
    createOutputUsers(manifestUsers).map((user) => user.biography),
    ["Bio one", "Bio two"],
  );
});

test("stops biography requests immediately on rate limits", async () => {
  const tray = [trayEntry("one"), trayEntry("two")];
  let requests = 0;
  await enrichTrayBiographies(
    tray,
    {
      ...createClient(tray, []),
      getUserProfile: async () => {
        requests += 1;
        return response(
          { biography: "", full_name: null, id: "one", pk: "one", username: "one" },
          429,
        );
      },
    },
    createMockLogger(),
  );
  assert.equal(requests, 1);
  assert.equal(tray[0]?.user.biography, undefined);
});

test("ignores mismatched profile identities and tolerates unavailable profiles", async () => {
  const tray = [trayEntry("one"), trayEntry("two"), trayEntry("three")];
  await enrichTrayBiographies(
    tray,
    {
      ...createClient(tray, []),
      getUserProfile: async (username) => {
        if (username === "three") {
          throw new Error("unavailable");
        }
        return response({
          biography: "wrong",
          full_name: null,
          id: "wrong",
          pk: "wrong",
          username: username === "one" ? "different" : username,
        });
      },
    },
    createMockLogger(),
  );
  assert.ok(tray.every((entry) => entry.user.biography === undefined));
});
