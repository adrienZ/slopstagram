import { defineAssistantEvals } from "@@/evals/assistant-cases.ts";
import { worldPlace } from "@@/evals/assistant-world.ts";

defineAssistantEvals([
  {
    name: "tagged places",
    question: "Quels lieux ont été tagués ?",
    expected: { tools: ["listTaggedPlaces"] },
  },
  {
    name: "place searched by name",
    question: `Est-ce qu'un lieu s'appelle ${worldPlace.name} ?`,
    expected: { tools: ["searchTaggedPlaces"] },
  },
  {
    name: "places called part of a name",
    question: "Est-ce qu'il y a des lieux qui s'appellent Synthetic ?",
    expected: { tools: ["searchTaggedPlaces"] },
  },
  {
    name: "details of a place",
    question: `Qui est allé au ${worldPlace.name}, et quand ?`,
    expected: { place: worldPlace, tools: ["searchTaggedPlaces", "getTaggedPlace"] },
  },
]);
