import { expect, test } from "vitest";
import { completeMention, findActiveMention, suggestMentions } from "../app/utils/chat-mentions.ts";

const users = ["alice", "alina", "bob"].map((username) => ({ avatarPath: "", username }));

test("a mention is active from its @ up to the caret", () => {
  expect(findActiveMention("Que fait @ali", 13)).toEqual({ query: "ali", start: 9 });
  expect(findActiveMention("@", 1)).toEqual({ query: "", start: 0 });
  expect(findActiveMention("mail@ali", 8)).toBeNull();
  expect(findActiveMention("@alice est là", 13)).toBeNull();
});

test("suggestions match the query anywhere in the handle", () => {
  expect(
    suggestMentions(users, { query: "ali", start: 0 }).map(({ username }) => username),
  ).toEqual(["alice", "alina"]);
  expect(suggestMentions(users, { query: "OB", start: 0 }).map(({ username }) => username)).toEqual(
    ["bob"],
  );
  expect(suggestMentions(users, null)).toEqual([]);
});

test("completing a mention keeps the text around it", () => {
  const mention = findActiveMention("Que fait @al aujourd’hui", 12);
  expect(mention).not.toBeNull();
  if (mention !== null) {
    expect(completeMention("Que fait @al aujourd’hui", 12, mention, "alice")).toEqual({
      caret: 16,
      text: "Que fait @alice  aujourd’hui",
    });
  }
});
