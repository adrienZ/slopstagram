import { describe, expect, it } from "vitest";
import { findMentions } from "../app/utils/mentions.ts";

function findMentionedUsernames(text: string): Array<string> {
  return findMentions(text).map(({ username }) => username);
}

describe("findMentions", () => {
  it("lists the mentioned usernames in order, as written", () => {
    expect(findMentionedUsernames("Compare @user_072 and @User.Two, then @user_072 again")).toEqual(
      ["user_072", "User.Two", "user_072"],
    );
  });

  it("drops the period that ends a sentence", () => {
    expect(findMentionedUsernames("What did @user_072 post?")).toEqual(["user_072"]);
    expect(findMentionedUsernames("Tell me about @user_072.")).toEqual(["user_072"]);
  });

  it("ignores an @ inside a word, an email address or a doubled @", () => {
    expect(findMentionedUsernames("mail me at someone@example.com or @@user_072")).toEqual([]);
  });

  it("gives where each Mention starts and how it is written", () => {
    expect(findMentions("Hi @User.Two.")).toEqual([
      { index: 3, text: "@User.Two", username: "User.Two" },
    ]);
  });

  it("finds nothing in a message without mention", () => {
    expect(findMentionedUsernames("Bonjour")).toEqual([]);
  });
});
