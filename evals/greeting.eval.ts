import { defineAssistantEvals } from "./assistant-cases.ts";

defineAssistantEvals([
  {
    name: "greeting",
    question: "Bonjour !",
    expected: { tools: [] },
  },
]);
