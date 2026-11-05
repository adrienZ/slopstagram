import { defineAssistantEvals } from "./assistant-cases.ts";
import { worldPlace } from "./assistant-world.ts";

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
    name: "details of a place",
    question: `Qui est allé au ${worldPlace.name}, et quand ?`,
    expected: { placeLink: worldPlace.id, tools: ["searchTaggedPlaces", "getTaggedPlace"] },
  },
]);
