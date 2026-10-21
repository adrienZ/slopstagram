import { atom } from "nanostores";
import type { AppData } from "./app.tsx";

export const $page = atom<AppData | null>(null);
export const $storyMediaPk = atom("");
