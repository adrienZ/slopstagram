# core

Domain and ingestion code, with no React and no Nitro. Each domain is one flat folder under
`domains/`, with no subfolders, except `database/`, which has subfolders. Outside `domains/`, only
`utils/` remains.

## Shared helpers

- `utils/`: domain-free helpers (data paths, JSON values, logging, provider identifiers, caption
  placeholders, search text matching). It is not a domain. Imports no domain; nothing
  domain-specific goes here.

## Domains

Every folder below lives in `domains/`.

- `database/`: the client, migrations, `entities/` and `repositories/`. No business rules.
- `runtime/`: the composition root, and the types of the external boundaries it exposes (`fetch-boundaries.ts`). It imports every domain; only entry points import its values, other modules import its types.
- `instagram/`: Instagram payload types, the story client, retry, the Playwright session, the
  story parser and payload validation. No persistence.
- `media-store/`: the local copies of images and audio the app serves, their content types, and
  the responses that serve them. Not the story cache.
- `stickers/`: story annotations, sticker and location extraction, story model types.
- `places/`: tagged place metadata, observations, place lookups, and the Assistant tools that read
  Tagged places.
- `music/`: music assets and media, music observations, story audio, DASH audio.
- `vision/`: the Ollama client, vision analysis, Apple OCR and the Apple caption step.
- `accounts/`: user summaries, Instagram user persistence and report user keys.
- `story-feed/`: the story feed, story days, the feed user summary read and its Assistant tool.
- `assistant/`: the chat Assistant. It composes the Assistant tools of the domains below it,
  holds the instructions and streams the reply. No tool-owning domain imports it.
- `fetch-run/`: the fetch run pipeline, reports, story fetching, the story cache and the hourly
  job.

## Assistant tools

An Assistant tool is one file, one tool: `<tool-name>.tool.ts` in kebab case (`list-accounts.tool.ts`
for `listAccounts`), next to the domain module it exposes. Never put two tools in one file; code
they share lives in the domain module. It exports a
`create<Name>Tool(runtime)` factory over the runtime narrowed to the repository methods it calls,
returning an AI SDK `tool` with an English description for agents, an input schema with
`.describe()` examples, an output schema and an execute function. It returns data, never UI, and
never writes; errors are typed outcomes in the output.

Register a new tool in `domains/assistant/assistant-tools.ts` as a read tool or a lookup tool,
under the key its file is named after, and give it a view in
`app/components/assistant-tool-views.tsx`. The compiler names what else is missing, including the
tests' fake chat model, and `knip --production` reports a tool module missing from the registry as
an unused file. The description says what the tool returns, when to use it and when not (naming
the tool to use instead), and what each outcome means. It does not repeat the Assistant's
instructions: how the chat shows a result, never inventing data, writing a place as a link
(ADR 0007).

## Repositories

A repository is a class built from a database (`new XRepository(db)`, plus a logger where it has
one), with methods named for domain reads and writes. Only `runtime/` builds repositories.
Services take the runtime, narrowed to the repository methods they call, never a raw database or
a helper module.
