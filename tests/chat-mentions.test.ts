import { describe, expect, test } from "vitest";
import { findMentions } from "../app/utils/mentions.ts";

function findMentionedUsernames(text: string): Array<string> {
  return findMentions(text).map(({ username }) => username);
}

describe(findMentions, () => {
  test("lists the mentioned usernames in order, as written", () => {
    expect(
      findMentionedUsernames("Compare @user_072 and @User.Two, then @user_072 again"),
    ).toStrictEqual(["user_072", "User.Two", "user_072"]);
  });

  test("drops the period that ends a sentence", () => {
    expect(findMentionedUsernames("What did @user_072 post?")).toStrictEqual(["user_072"]);
    expect(findMentionedUsernames("Tell me about @user_072.")).toStrictEqual(["user_072"]);
  });

  test("ignores an @ inside a word, an email address or a doubled @", () => {
    expect(findMentionedUsernames("mail me at someone@example.com or @@user_072")).toStrictEqual(
      [],
    );
  });

  test("gives where each Mention starts and how it is written", () => {
    expect(findMentions("Hi @User.Two.")).toStrictEqual([
      { index: 3, text: "@User.Two", username: "User.Two" },
    ]);
  });

  test("finds nothing in a message without mention", () => {
    expect(findMentionedUsernames("Bonjour")).toStrictEqual([]);
  });
});
