import assert from "node:assert/strict";
import { test } from "node:test";
import { serializeSignalData } from "../server/signal-json.ts";

test("signal JSON survives bootstrap serialization without exposing HTML delimiters", () => {
  const values = {
    caption: '</ScRiPt><script>alert("caption")</script><!-- été 🌅 & \\u003c',
    mediaPk: "</script>",
    position: 1,
    avatar: undefined,
    nested: { caption: "<nested>" },
  };
  const serialized = serializeSignalData([values]);
  const bootstrap = JSON.stringify({ storiesJson: serialized });

  assert.doesNotMatch(bootstrap, /</u);
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- The test just serialized this exact shape above.
  const hydrated: { storiesJson: string } = JSON.parse(bootstrap);
  assert.deepEqual(JSON.parse(hydrated.storiesJson), [
    {
      caption: values.caption,
      mediaPk: values.mediaPk,
      position: values.position,
      nested: values.nested,
    },
  ]);
});
