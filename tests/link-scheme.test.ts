import { describe, expect, it } from "vitest";
import {
  buildLinkTarget,
  linkMentions,
  parseLinkTarget,
  transformLinkTarget,
} from "../app/utils/link-scheme.ts";

const accounts = [{ username: "user_072", avatarPath: "/media/avatars/1.jpg" }];

describe("parseLinkTarget", () => {
  it("reads the scheme and the id of a known scheme", () => {
    expect(parseLinkTarget("place:abc-1")).toEqual({ scheme: "place", id: "abc-1" });
    expect(parseLinkTarget("user:user_072")).toEqual({ scheme: "user", id: "user_072" });
    expect(parseLinkTarget(buildLinkTarget("place", "a:b"))).toEqual({
      scheme: "place",
      id: "a:b",
    });
  });

  it("ignores an unknown scheme, a missing id and a target without scheme", () => {
    for (const url of [
      "data:text/html,x",
      "https://example.com",
      "place:",
      "/users/a",
      ":x",
      "placex",
    ]) {
      expect(parseLinkTarget(url)).toBeUndefined();
    }
  });
});

function dropped(): string {
  return "";
}

describe("transformLinkTarget", () => {
  it("keeps the target of a known scheme and sends any other to the default transform", () => {
    expect(transformLinkTarget("user:user_072", dropped)).toBe("user:user_072");
    expect(transformLinkTarget("data:text/html,x", dropped)).toBe("");
  });
});

describe("linkMentions", () => {
  it("writes the mention of an account as a user link, whatever its case", () => {
    expect(linkMentions("Hi @User_072!", accounts)).toBe("Hi [@User_072](user:user_072)!");
  });

  it("leaves other names, emails and links as they are", () => {
    expect(linkMentions("@nobody me@user_072.com https://x.test/@user_072", accounts)).toBe(
      "@nobody me@user_072.com https://x.test/@user_072",
    );
  });
});
