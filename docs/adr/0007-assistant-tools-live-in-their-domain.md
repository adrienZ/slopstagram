# Assistant tools live in the domain whose data they read

The chat Assistant reads the application's data through Assistant tools. We could have
put every tool in one chat module next to the route, but a tool then changes away from
the data it reads and drifts from the domain behavior it is meant to expose (the story
feed and the tool reading a different user summary, for example). The spec is
[issue #275](https://github.com/adrienZ/slopstagram/issues/275).

An Assistant tool lives in the domain whose data it reads, in a module named after the
domain module with a `.tool` suffix (`saved-accounts.tool.ts` next to `saved-accounts.ts`,
`feed-user-summary.tool.ts` next to `feed-user-summary.ts`). The module
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

A tool says how the chat shows its result. A tool whose result the chat renders as a card
declares it with `metadata: { renderedAs: "card" }`, and the Assistant ends its reply once
every tool the model just called is a card tool, so the model does not write the card's
content a second time. A small model does not hold back from restating a result when the
prompt asks it to, so the rule is enforced in code instead. A question that needs the model
to reason over several results (a comparison, a filter) therefore goes to a data tool, which
renders no card: `getFeedUserSummary` answers a single account with a card, and
`getFeedUserSummaries` returns several accounts' summaries for the model to compare. Each
tool description says when not to use the other.
