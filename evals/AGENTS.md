# evals

`npm run eval` runs the [Evalite](https://evalite.dev) suites in `*.eval.ts`: the real chat model
answers French questions through the chat route handler, over the synthetic report world of the
tests. It fails when the average score is under `scoreThreshold` in `evalite.config.ts`, the
baseline of the default chat model: raise it when the model improves.

- The cases are split by area, one eval file each: `story-feed`, `accounts`, `places`, `mention-connections` and
  `greeting` (`evals/<area>.eval.ts`), declared through `defineAssistantEvals`
  (`evals/assistant-cases.ts`). Run one with a file filter, e.g. `npm run eval -- places`
  (Evalite takes a single filter): the threshold then applies to the cases that ran.
- Needs the Ollama server (`curl localhost:11434/api/version`) with the chat model pulled
  (`OLLAMA_CHAT_MODEL`, e.g. `ollama pull qwen3.5:0.8b`).
- The terminal table is cut short: read the full answers and traces in `npm run eval:export`
  (`evalite-export/`, open with `npx serve -s evalite-export`) or in
  `evalite-export/last-run.json`, which every `npm run eval` writes. `eval:export` renders the
  last `npm run eval` from `data/evalite.db` (SQLite storage, `better-sqlite3`); with no stored
  run it runs the evals itself, without the threshold.
- The LLM judge runs `gpt-6-luna` when the `codex` CLI is installed, and is skipped otherwise and on CI (`CI` is set: the GitHub runners have `codex` but no login). Its
  Codex login must have access to that model, or every judged run fails with `model_not_found`.
- The `Evals` workflow exports the HTML report (`eval:export`) after the run, from the SQLite storage; with
  no stored run `eval:export` would run the evals again, so it is skipped.
- Evals are not tests: `npm run check`, `npm test` and the `Check` workflow never run them. Do not
  run `evalite watch` or `evalite serve` in an agent session: they keep a server running.
- Only synthetic data may reach the chat model and the judge: never `data/`, the application
  database or real accounts. Never add personal data to a case.
