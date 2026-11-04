# Assistant tools live in the domain whose data they read

The chat Assistant reads the application's data through Assistant tools. We could have
put every tool in one chat module next to the route, but a tool then changes away from
the data it reads and drifts from the domain behavior it is meant to expose (the story
feed and the tool reading a different user summary, for example). The spec is
[issue #275](https://github.com/adrienZ/slopstagram/issues/275).

An Assistant tool lives in the domain whose data it reads, in a module named after the
domain module with a `.tool` suffix (`accounts.tool.ts`, `story-feed.tool.ts`). The module
exports a factory that takes the runtime narrowed to the repository methods the tool
calls, like the domain services do, and returns an AI SDK tool with a description, an
input schema, an output schema and an execute function. Tools return data, never UI, and
never write. Errors are typed outcomes in the output, not free text.

Only tool modules and the Assistant domain may import the AI SDK. A lint rule enforces
it, so the AI SDK does not spread through the business code and swapping it (see the
rationale on the Vercel AI SDK and TanStack AI) touches only those modules.

The Assistant domain sits above the domains that expose tools: it composes their tools,
holds the instructions and streams the Assistant's reply. No tool-owning domain imports
it. The story feed domain may now import the accounts domain, so that the story feed's
user summary tool can resolve an account; the accounts domain never imports the story
feed, which keeps the dependency one-way.
