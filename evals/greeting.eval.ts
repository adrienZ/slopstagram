import { defineAssistantEvals } from "@@/evals/assistant-cases.ts";

defineAssistantEvals([
  {
    name: "greeting",
    question: "Bonjour !",
    expected: { tools: [] },
  },
]);
