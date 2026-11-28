import { expect, test } from "vitest";
import type { GraphConnection } from "../app/components/mention-graph-canvas-props.ts";
import type { GraphLink, GraphNode } from "../app/components/mention-graph-drawing.ts";
import { pickAt } from "../app/components/mention-graph-hit-test.ts";

function createNode(
  id: GraphNode["id"],
  kind: "account" | "unknown",
  x: number,
  y: number,
): GraphNode {
  return {
    id,
    x,
    y,
    point:
      kind === "account"
        ? { kind, id, label: id, username: id, fullName: null, avatarPath: "" }
        : { kind, id, label: id },
  };
}

const account = createNode("account:1", "account", 0, 0);
const unknown = createNode("username:two", "unknown", 100, 0);
const nodes = [account, unknown];

const connection: GraphConnection = {
  id: "connection",
  source: "account:1",
  target: "username:two",
  labels: ["one", "two"],
  storyPks: ["1"],
};

const link: GraphLink = { source: account, target: unknown, connection };

test("a position inside a point picks that point", () => {
  expect(pickAt({ nodes, links: [link] }, { x: 10, y: 10 }, 1)).toBe(account);
});

test("a small point is still reachable when the view is zoomed out", () => {
  const farAway = { x: 100, y: 12 };

  expect(pickAt({ nodes, links: [] }, farAway, 1)).toBeNull();
  expect(pickAt({ nodes, links: [] }, farAway, 0.4)).toBe(unknown);
});

test("a position on a connection between two points picks the connection", () => {
  expect(pickAt({ nodes, links: [link] }, { x: 50, y: 3 }, 1)).toBe(link);
});

test("a point wins over the connection that reaches it", () => {
  expect(pickAt({ nodes, links: [link] }, { x: 95, y: 0 }, 1)).toBe(unknown);
});

test("a position away from everything picks nothing", () => {
  expect(pickAt({ nodes, links: [link] }, { x: 50, y: 80 }, 1)).toBeNull();
});
