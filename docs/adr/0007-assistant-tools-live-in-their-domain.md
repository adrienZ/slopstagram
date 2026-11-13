---
status: amended by issue #339
---

# Assistant tools live in the domain whose data they read

The chat Assistant reads the application's data through Assistant tools. We could have
put every tool in one chat module next to the route, but a tool then changes away from
the data it reads and drifts from the domain behavior it is meant to expose (the story
feed and the tool reading a different user summary, for example). The spec is
[issue #275](https://github.com/adrienZ/slopstagram/issues/275).

An Assistant tool lives in the domain whose data it reads, one tool per module, named after
the tool with a `.tool` suffix (`list-accounts.tool.ts` for `listAccounts`,
`get-feed-user-summaries.tool.ts` for `getFeedUserSummaries`), next to the domain module it
calls. The module
exports a factory that takes the runtime narrowed to the repository methods the tool
calls, like the domain services do, and returns an AI SDK tool with a description, an
input schema, an output schema and an execute function. Tools return data, never UI, and
never write. Errors are typed outcomes in the output, not free text.

Only tool modules and the Assistant domain may import the AI SDK in business code. A lint
rule enforces it, so the AI SDK does not spread through the business code and swapping it
(see the rationale on the Vercel AI SDK and TanStack AI) touches only those modules. Three
places outside business code are allowed too: the one chat hook of the app, because the
page needs `useChat` and its HTTP transport; the tests; and the evals, whose judge is an
AI SDK provider. Components and the chat route import nothing from the AI SDK, not even
types: they use the Assistant domain's message type.

The Assistant domain sits above the domains that expose tools: it composes their tools,
holds the instructions and streams the Assistant's reply. No tool-owning domain imports
it. The story feed domain may now import the accounts domain, so that the story feed's
user summary tool can resolve an account; the accounts domain never imports the story
feed, which keeps the dependency one-way.

The chat shows each tool call as one collapsed tool trace: the tool's name and what it was
asked, which opens on what the tool read. The Assistant's answer is the display; the result
stays behind the trace. Rendering it as a card next to the answer showed the same content twice,
and a small model does not hold back from restating a result when the prompt asks it to. The
tool descriptions tell the model so, in the same words.

## Amended on 2026-11-11: the registry and the views record

Amended by [issue #339](https://github.com/adrienZ/slopstagram/issues/339), part of
[issue #313](https://github.com/adrienZ/slopstagram/issues/313). The paragraph above on the
tool trace replaces one that said the chat does not render a tool's result.

Adding a tool used to mean editing many files that repeated the list of tools by hand, and
forgetting some of them failed silently. The Assistant domain now holds the only list of
Assistant tools, a registry. It lists each tool as a read tool, after whose result the model
writes the answer, or a lookup tool, after whose result it keeps reasoning. That step policy is the Assistant's
fact about the model's loop, not the tool's: a tool still lives in its domain, returns data and
never UI, and does not import the Assistant domain as a value. The tool names, the runtime the
Assistant needs and the chat message type are derived from the registry.

On the chat page, one record over every tool name states how the tool is shown: its icon, the
body of its result, and the Tagged places its output names, or explicitly none. A tool without
a view or a scripted answer in the tests' fake chat model does not compile, and a tool module
that is neither a read nor a lookup tool is reported by `knip --production`. A tool
the page does not know shows its tool trace only. The app reads the Assistant domain through its
types only, outside the server routes, and never imports a tool module; a lint rule enforces it,
so the AI SDK, the tool schemas and the repositories stay out of the browser bundle.
