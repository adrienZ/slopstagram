import { expect, test } from "vitest";
import { handleChatRequest } from "../app/routes/api/chat.ts";
import { seedAssistantWorld, worldAccounts } from "../evals/assistant-world.ts";
import { chatRequest, readChunks, userMessage } from "./setup/chat-stream.ts";
import { createWorld } from "./setup/report-world.ts";

test.for([
  { secondPerson: worldAccounts.withoutConnections, status: "no_observation" },
  { secondPerson: worldAccounts.unknown, status: "unknown_person" },
])("the eval world distinguishes $status", async ({ secondPerson, status }, context) => {
  const world = await createWorld(context);
  const runtime = {
    ...(await seedAssistantWorld()),
    fetchOllama: world.runtime.fetchOllama,
    wrapModel: undefined,
  };
  const answer = await readChunks(
    await handleChatRequest(
      runtime,
      chatRequest(
        userMessage(`Connection @${worldAccounts.withoutRecentStories} and @${secondPerson}`),
      ),
    ),
  );

  expect(answer.toolInputs).toHaveLength(1);
  expect(answer.toolOutputs).toEqual([expect.objectContaining({ status })]);
});
