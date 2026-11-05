import { defineAssistantEvals } from "./assistant-cases.ts";

defineAssistantEvals([
  {
    name: "saved accounts",
    question: "Quels comptes sont enregistrés ?",
    expected: { tools: ["listAccounts"] },
  },
  {
    name: "account name matching no saved account",
    question: "Est-ce qu'on suit quelqu'un qui s'appelle Zelda ?",
    expected: { tools: ["searchAccounts"] },
  },
]);
