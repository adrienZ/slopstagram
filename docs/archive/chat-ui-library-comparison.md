# Research: UI libraries for agent / LLM chat interfaces

Updated **22 October 2026**, including a fresh search for alternatives without paid tiers.

## Decision

**Start with Beautiful UI and Prompt Kit for a custom agent interface; investigate aparté when a runtime is also wanted.** The target is an agent / LLM workspace with streaming, visible tools, task progress, structured results, and human-in-the-loop interaction.

The new search adds **agentickit** as an experimental React agent-integration option and **agenttrace-ui** as a focused trace/approval component layer. Neither has enough validation here to become the default recommendation.

## Eligibility: no paid tiers

Exclude candidates with paid library tiers, premium editions, or directly associated paid cloud/runtime plans, even when their open-source core can be used free. A free tier is insufficient. Unrelated hosting services and model providers do not determine eligibility; inference and infrastructure can still cost money.

For retained candidates, **“no paid tier found” is a dated research finding**, based on the linked official sites, repositories, and targeted pricing searches. An open-source license alone does not establish the absence of paid plans. No package was installed or benchmarked, and compatibility with TanStack Start has not been tested.

| Removed candidate           | Reason                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **assistant-ui**            | Its UI library is free/MIT, but associated Assistant Cloud offers paid plans. Excluded under the stricter product-family rule. [Pricing](https://www.assistant-ui.com/pricing)                                                                                                                                                                                                                                             |
| **CopilotKit**              | Paid Pro, Team, and Enterprise plans alongside its free offering. [Pricing](https://www.copilotkit.ai/pricing)                                                                                                                                                                                                                                                                                                             |
| **Lobe UI**                 | The UI package is distinct from LobeHub Cloud; excluded conservatively because the same product family offers paid plans. [LobeHub pricing](https://lobehub.com/pricing)                                                                                                                                                                                                                                                   |
| **Agents Kit** (new search) | Root license permits non-commercial use only without prior written permission; it directs commercial licensing inquiries to the author. Upstream components retain separate licenses. Not a freely usable commercial shortlist candidate. [License](https://raw.githubusercontent.com/agents-ui/agents-kit/main/LICENSE.md), [Notices](https://raw.githubusercontent.com/agents-ui/agents-kit/main/THIRD_PARTY_NOTICES.md) |

**React ChatBotify and Deep Chat remain excluded for product fit**, as previously requested. Traditional messaging kits are outside the shortlist. NLUX is also dropped: it is a weaker agent-workflow fit and its modified MPL license adds restrictions; this is not a claim that it has paid tiers. [NLUX repository/license](https://github.com/nlkitai/nlux)

## Comparison matrix

The app uses React 19, TanStack Start/Router, Vite, Nitro, plain CSS, clsx, and zod. Tailwind, shadcn, Ant Design, and the AI SDK would be new foundations. Setup assessments below are judgments, not measured implementation times.

**UI** means presentation, not backend execution or durable state. An approval card only becomes an enforced approval when connected to an agent that pauses and resumes correctly.

| Candidate                                      | Pricing / license finding                                                                     | Agent tools and progress                                                                           | Approvals / questions                                         | State and backend ownership                                            | Setup and assessment                                                                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Beautiful UI**                               | No library tier found; MIT. Paid icon dependency in the full demo must be replaced or omitted | Tool chips, task rows, thinking, context, records and diffs                                        | Approval card UI                                              | We own transport, agent execution and persistence; harness is scripted | Medium; strong visual fit, Tailwind v4/shared CSS. [Gallery](https://www.beautifului.dev/), [Source](https://github.com/slev12397/beautiful-ui)      |
| **Prompt Kit**                                 | No paid tier found; MIT                                                                       | Reasoning, Markdown, code and composable AI interface components; customize task/tool presentation | Custom composition and wiring                                 | We own conversation state and agent connection                         | Medium; focused source-owned components, Tailwind/shadcn. [Repository](https://github.com/ibelick/prompt-kit)                                        |
| **shadcn AI patterns / AI Elements successor** | No paid component tier found in the official project; copied source                           | Tool/reasoning patterns, traces, code and related components                                       | Wire patterns to agent events                                 | We own state, transport and execution                                  | Medium–high; broad building blocks with a distribution migration. [Official docs](https://ui.shadcn.com/docs/ai-elements)                            |
| **aparté**                                     | No paid tier found; MIT                                                                       | Tool-call status, reasoning, artifacts, branches and agent templates                               | Approval and question components; runtime support             | Optional agent runtime; own persistence adapter/backend                | Medium; CSS variables, Web Components and React wrappers; beta. [Project](https://apartejs.dev/)                                                     |
| **agentickit** — new                           | No paid tier found for `@hec-ovi/agentickit`; MIT                                             | Typed frontend tools, shared app state, streamed agent UI                                          | `renderAndWait` pause/resume; confirmation handling           | React provider plus AI SDK or AG-UI runtime; own server                | Medium–high; relevant to agents acting inside the app, but young and unvalidated here. [Repository](https://github.com/hec-ovi/agentickit)           |
| **agenttrace-ui** — new                        | No paid tier found; MIT                                                                       | Timeline, graph and compact tool traces, arguments/results and timing                              | Approval gate integration                                     | Supplements an existing AI SDK conversation; no complete chat runtime  | Medium; copy source, add composer/history separately; experimental. [Repository](https://github.com/NikitaKharya09/agenttrace-ui)                    |
| **Ant Design X**                               | No paid library tier found in the official project                                            | AI UI suite: thought chains, sources, bubbles, sender and attachments                              | Compose with app logic                                        | UI suite and optional X SDK; agent execution remains ours              | High; keep as a fallback if adopting Ant Design broadly. [Official site](https://x.ant.design/), [Repository](https://github.com/ant-design/x)       |
| **Loquix**                                     | No paid tier found; MIT                                                                       | Tool, citation and attachment presentation                                                         | Verify exact component/version coverage; app owns enforcement | Presentational Web Components; own state/transport                     | Medium; Lit and CSS parts, less React-native; secondary option. [Official site](https://loquix.dev/), [Source](https://github.com/loquix-dev/loquix) |

## Leading options

### Beautiful UI: strongest visual starting point

Its agent primitives cover the desired activity and control surfaces. The supplied harness uses scripted scenarios; connect the components to our own token stream, tool events, task status and approval responses. It does not supply persistent conversations or an agent backend. [Source and wiring guide](https://github.com/slev12397/beautiful-ui)

**Paid dependency caveat:** the repository explicitly says `SidebarNav` imports the commercial `@central-icons-react` library and its installation checks a license. Use only selected free primitives and replace/omit those icons; do not install the demo unchanged. Beautiful UI itself has no library pricing tier found. If accepting it unchanged is required, remove it from the shortlist too. [Upstream installation warning](https://github.com/slev12397/beautiful-ui)

### Prompt Kit: focused components we own

A useful choice for assembling an LLM interface while keeping state and backend decisions in the app. Components are copied through the shadcn CLI. We would add Tailwind/shadcn and implement conversation behavior, tool event mapping and approvals. Its official repository presents an MIT component project; no paid tier was found. The website returned HTTP 403 during this recheck, so pricing verification relied on the repository and targeted searches rather than a complete live-site review. [Repository](https://github.com/ibelick/prompt-kit)

### aparté: closest retained option to an agent UI plus runtime

The documented interface includes tools, reasoning, approvals and questions. Its templates include assistant, coding-agent and research-agent experiences. The project identifies itself as beta; pin and test an exact version. Its zero-third-party-dependencies claim applies to the core, not automatically to optional plugins or the complete integration. No paid offering was found on its official site. [Components and templates](https://apartejs.dev/), [Stability policy](https://apartejs.dev/reference/stability/)

## Findings from the new search

### agentickit: investigate for application actions

`@hec-ovi/agentickit` exposes React hooks for shared state, tools and forms, with a custom chat view and other chat surfaces. It supports AI SDK and optional AG-UI runtimes, including human-in-the-loop pause/resume. Its server examples use Web Fetch API frameworks; verify TanStack Start/Nitro integration. It is a small, young project, so treat it as an experiment. [Official repository](https://github.com/hec-ovi/agentickit)

This is Hector Oviedo's MIT React package, **not** the similarly named commercial Cursor/Claude kits or AgentKit cloud products. No paid tier was found for this specific package. Model-provider adapters are separate choices. [License and package identity](https://github.com/hec-ovi/agentickit#license--attribution)

### agenttrace-ui: investigate as an agent visibility layer

Provides progressively expandable tool traces in timeline, graph and compact views, with an approval-gate example. It is copied as source and is not yet published to npm. Its integration guide assumes AI SDK v6 and a working Next.js app; adapting the React components here still needs verification. It complements a composer and conversation UI rather than replacing them. No paid tier was found. [Official repository and integration guide](https://github.com/NikitaKharya09/agenttrace-ui)

### Agents Kit: discovered, then rejected

Its gallery looks relevant, but its root license restricts commercial use. Do not infer a permissive project license from the MIT components it incorporates. It is excluded from the matrix and recommendations. [Project license](https://raw.githubusercontent.com/agents-ui/agents-kit/main/LICENSE.md)

## AI Elements distribution and pricing distinction

AI Elements is moving to shadcn/ui, with legacy deprecation announced for the end of November 2026. New projects should use the successor components and patterns; the migration includes renamed, replaced and omitted elements. [Announcement](https://elements.ai-sdk.dev/), [Migration and new-project guidance](https://ui.shadcn.com/docs/ai-elements)

This comparison refers to **official `ui.shadcn.com` source components**, not similarly named commercial component marketplaces such as shadcn.io. Vercel hosting and model inference are separate services; neither is required to copy the UI patterns.

## Next evaluation

Compare **Beautiful UI, Prompt Kit and aparté** with the same interaction: stream a reply, show a running tool and structured result, update task progress, request approval, and resume after a decision. Check cancellation, conversation switching and reload behavior. Use mocked events first, without provider keys.

Choose **Beautiful UI** for its agent visual vocabulary, subject to removing the paid icon dependency. Choose **Prompt Kit** for focused source-owned components. Investigate **aparté** if avoiding a self-built interaction runtime matters more than React-native composition. Add **agentickit** to the experiment when acting on application state is central, or **agenttrace-ui** when detailed tool visibility is the missing piece.

No implementation, bundle benchmark, accessibility audit or production integration was performed for these candidates. Before adoption, review the exact selected dependencies and licenses, then compare equivalent production builds and verify pause/resume against our backend.
