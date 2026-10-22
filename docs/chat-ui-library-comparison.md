# Research: UI libraries for the chat / bot interface

Researched **22 October 2026**. Discovery and comparison were delegated to a **research subagent**, with additional source review by the main agent. Your two links are starting examples; the scope includes alternatives.

## Decision

**My recommendation for a full ChatGPT-like page is assistant-ui. The strongest alternatives for reducing integration work and dependencies are Deep Chat and React ChatBotify.** These solve different amounts of the problem:

- **Most complete React conversation solution: assistant-ui.** Prefer it if editing messages, response branches, cancellation, tool rendering, and conversation state are requirements. Its runtime saves work beyond the appearance of the chat. [Architecture](https://www.assistant-ui.com/docs/architecture), [Thread components](https://www.assistant-ui.com/components/assistant-ui)
- **Easiest ready-made AI chat without a new styling system: Deep Chat.** It supplies the transcript/composer, Markdown, streaming, files, and custom-service integration. The tradeoff is a Web Component rather than a set of native React primitives. [Features](https://github.com/OvidijusParsiunas/deep-chat), [Installation](https://deepchat.dev/docs/installation/)
- **Smallest declared dependency surface among the shortlisted native React packages: React ChatBotify.** Its manifest lists one runtime dependency, apart from React/React DOM peers. It can be embedded in a page, but is oriented around chatbot flows rather than a ChatGPT-style conversation tree. [Manifest](https://github.com/react-chatbotify/react-chatbotify/blob/main/package.json), [Settings](https://react-chatbotify.com/docs/v2/api/settings/)
- **Best copy-in visual building blocks: Prompt Kit.** A better starting point than Beautiful UI when the goal is assembling a custom chat surface from focused components. It requires React 19, Tailwind, and shadcn, which makes it less immediate in this repository. [Project requirements](https://github.com/ibelick/prompt-kit/blob/main/llms.txt)
- **Promising dependency-conscious option to investigate: aparté.** Its core claims no third-party dependencies and it has React 18/19 wrappers, but it is explicitly beta. Treat it as an experimental contender, not the default production choice. [Frameworks](https://apartejs.dev/frameworks/), [Stability policy](https://apartejs.dev/reference/stability/)

**Recommended next comparison: assistant-ui versus Deep Chat, with ChatBotify included if package count is the main constraint.** There is a credible library shortlist; building all the chat behavior ourselves should not be the automatic answer to wanting fewer dependencies.

## What “best fit” means here

The existing app uses **React 19, TanStack Start/Router, Vite, Nitro, plain CSS, clsx, and zod**. It does not currently use Tailwind, shadcn, Ant Design, or the Vercel AI SDK.

Evaluation priorities:

1. A full-page user/assistant conversation and composer, rather than only a floating support widget.
2. UI-only rendering without a backend or provider key for the first iteration.
3. Streaming presentation, stop/retry, Markdown/code, attachments, and sensible scrolling.
4. Optional advanced behavior: editing, response branches, tools, citations, and conversation history.
5. Additional runtime packages, styling setup, and integration work in the existing stack.
6. Licensing, current documentation, and signs of maintenance.

The findings below come from official documentation, source, manifests, and licenses. Setup ratings are **project-specific judgments**, not measured implementation times. No candidate was installed or benchmarked during this research. A version range admitting React 19 is evidence of declared compatibility, not proof that its TanStack integration has been tested.

## Broad comparison

| Library                                | What it provides                                                                                                  | Setup in this app                                 | Dependency / styling tradeoff                                                                                 | Assessment                                                                                                                                                                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **assistant-ui**                       | React chat primitives plus conversation runtime; editing, branches, streaming, cancellation, attachments, tool UI | Medium                                            | Custom CSS is possible; styled Thread introduces shadcn/Tailwind and supporting packages                      | **Best overall for a complete ChatGPT-style React experience.** [Docs](https://www.assistant-ui.com/docs/architecture)                                                                                                       |
| **Deep Chat**                          | Ready-made AI transcript and composer, Markdown, files, streaming, service handlers                               | Low–medium                                        | No Tailwind/shadcn; React wrapper adds Lit integration and core dependencies; browser boundary needs checking | **Best ready-made alternative for this CSS stack.** [Docs](https://deepchat.dev/docs/installation/), [Framework guidance](https://deepchat.dev/examples/frameworks/)                                                         |
| **React ChatBotify**                   | React chatbot, configurable flows, streaming APIs, custom components, attachments, optional plugins               | Low                                               | One declared core runtime dependency; own settings/styles; Markdown is an extra plugin                        | **Strong lean React option; more page/history work than assistant-ui.** [Quickstart](https://react-chatbotify.com/docs/v2/introduction/quickstart/), [Overview](https://react-chatbotify.com/docs/v2/introduction/overview/) |
| **Prompt Kit**                         | Copy-in chat container, messages, prompt input, Markdown, reasoning and related UI                                | Medium                                            | React 19 + Tailwind + shadcn; packages depend on selected components                                          | **Best for owning and styling chat source, with app state supplied by us.** [Source](https://github.com/ibelick/prompt-kit)                                                                                                  |
| **AI Elements / shadcn AI components** | Broad composable AI UI: messages, tools, sources, reasoning, attachments, input                                   | Medium–high                                       | shadcn/Tailwind foundation; examples are AI SDK-shaped; per-component dependencies                            | **Worth considering if adopting shadcn; follow the migration described below.** [Current direction](https://ui.shadcn.com/docs/ai-elements)                                                                                  |
| **Beautiful UI**                       | Copyable visual AI primitives and demo compositions                                                               | Low for one primitive; medium for a complete page | Shared styling foundation; some components add effects or paid icon dependencies                              | **Visual inspiration / selected primitives, not a complete assistant runtime.** [Project](https://www.beautifului.dev/)                                                                                                      |
| **Ant Design X**                       | Broad AI UI suite: conversations, bubbles, sender, attachments, thought chains, sources                           | High                                              | Introduces Ant Design and its styling/runtime ecosystem                                                       | **Comprehensive AI components, but disproportionate unless adopting Ant Design.** [Component overview](https://x.ant.design/components/introduce/)                                                                           |
| **Lobe UI**                            | Broad AI application component system, including chat and rich content                                            | High                                              | Current manifest includes Base UI, StyleX/Emotion, motion, Markdown/code, drag-and-drop and other packages    | **A larger design-system choice, not a small chat addition.** [Catalog](https://ui.lobehub.com/), [Manifest](https://github.com/lobehub/lobe-ui/blob/master/package.json)                                                    |
| **Chatscope Chat UI Kit**              | Traditional chat layouts, conversation lists, messages and composer                                               | Medium                                            | Separate stylesheet plus icon and utility dependencies; AI behavior is app work                               | **Useful messaging shell; less complete for assistant-specific behavior.** [Repository](https://github.com/chatscope/chat-ui-kit-react)                                                                                      |
| **NLUX**                               | Turnkey conversational AI component, streaming Markdown and adapters                                              | Low–medium                                        | Core advertises zero dependencies; React/theme packages still need evaluation                                 | **Interesting lightweight option, but license and feature gaps lower its ranking.** [Docs](https://docs.nlkit.com/nlux), [Repository/license](https://github.com/nlkitai/nlux)                                               |
| **aparté**                             | Web Components and runtime for chat, branches, tools, approvals and attachments                                   | Medium                                            | CSS variables; no third-party dependencies claimed for core; first-party packages/plugins still count         | **Promising beta challenger; validate stability and integration first.** [Getting started](https://apartejs.dev/guides/getting-started/)                                                                                     |
| **Loquix**                             | Composable Web Components for messages, composer, citations, tools and attachments                                | Medium                                            | Lit peer, Floating UI dependency; slots/CSS parts instead of React-first composition                          | **Lean presentation option, but young and more integration work.** [Docs](https://loquix.dev/docs/), [Manifest](https://github.com/loquix-dev/loquix/blob/main/packages/core/package.json)                                   |
| **CopilotKit**                         | In-app copilot UI and agent/application integration                                                               | High for this scope                               | Adds agent/runtime infrastructure beyond the requested UI                                                     | **Revisit if the bot must act on app state; excessive for a first chat page.** [Project](https://github.com/CopilotKit/CopilotKit)                                                                                           |

## Shortlist details

### 1. assistant-ui — most complete for the intended page

Its main advantage is behavior: a conversation runtime, message editing, branches, stop/retry, streaming-aware scrolling, attachments, and custom tool rendering. Those are features we would otherwise maintain. The runtime is separate from model providers and persistence; Assistant Cloud is optional. [Architecture](https://www.assistant-ui.com/docs/architecture), [Thread](https://www.assistant-ui.com/components/assistant-ui)

A local adapter can return static content for UI-only work, then later call our own server. No provider SDK or backend is intrinsically required for that local adapter. [LocalRuntime](https://www.assistant-ui.com/docs/runtimes/custom/local-runtime)

**Cost:** the core is not dependency-free. Its manifest includes its own runtime/store packages and third-party dependencies such as Radix, textarea autosizing, zod, and zustand. The styled installation adds Markdown and shadcn/Tailwind-related components/packages. Custom styling avoids adopting the whole styled setup, but does not remove runtime dependencies. [Core manifest](https://github.com/assistant-ui/assistant-ui/blob/main/packages/react/package.json), [Installation](https://www.assistant-ui.com/docs/installation)

**Choose it when:** the desired product is a customizable ChatGPT-like assistant, including richer conversation behavior. MIT license. [License](https://github.com/assistant-ui/assistant-ui#license)

### 2. Deep Chat — easiest complete chat surface without Tailwind

The official install for React is `npm install deep-chat-react`. Styling and behavior are configurable without introducing shadcn or Tailwind. Its built-in chat includes Markdown, attachments, and streaming; a custom handler can supply a local response for UI-only development or later connect to our API. [Installation](https://deepchat.dev/docs/installation/), [Connection and streaming handlers](https://deepchat.dev/docs/connect/)

**Cost:** `deep-chat-react` declares `@lit/react` and `deep-chat`; the core declares `@microsoft/fetch-event-source`, `remarkable`, and `speech-to-element`. It is a small integration surface, not a zero-dependency package. Its React peer range is `>=16.8.0`. [React manifest](https://github.com/OvidijusParsiunas/deep-chat/blob/main/other-packages/react/package.json), [Core manifest](https://github.com/OvidijusParsiunas/deep-chat/blob/main/component/package.json)

**Tradeoff:** much of the interface lives inside a configurable Web Component. Our sidebar, thread selection, routing and persistence remain app responsibilities. Its framework docs recommend dynamic loading for SSR frameworks; a client-only boundary in TanStack Start is therefore an integration point to verify, not something this research proves works. [Framework examples](https://deepchat.dev/examples/frameworks/)

**Choose it when:** fast integration and avoiding a new styling system matter more than React-level control of every internal primitive. MIT license. [Repository](https://github.com/OvidijusParsiunas/deep-chat)

### 3. React ChatBotify — leanest native React package shortlist

The quickstart is one installation, one import, and `<ChatBot />`. The `general.embedded` setting places it in a page; styles use familiar React style objects. This is a simpler styling adoption than adding Tailwind to this app. [Quickstart](https://react-chatbotify.com/docs/v2/introduction/quickstart/), [Settings](https://react-chatbotify.com/docs/v2/api/settings/), [Styling](https://react-chatbotify.com/docs/v2/concepts/styles/)

The reviewed manifest lists **one runtime dependency**, `@rcb-plugins/input-validator`, and React/React DOM peers `>=16.14.0`. That is a declared direct dependency count, not a complete transitive audit or browser bundle measurement. The project is MIT-licensed. [Manifest](https://github.com/react-chatbotify/react-chatbotify/blob/main/package.json)

**Tradeoff:** its core abstraction is a chatbot flow. That works for guided interactions and can connect to an LLM, but a polished multi-conversation page, editing/branching, and ChatGPT-style history management need additional work. Markdown is provided through a plugin rather than included in the minimal core. [Overview](https://react-chatbotify.com/docs/v2/introduction/overview/), [Markdown example](https://react-chatbotify.com/docs/v2/examples/markdown_render/)

**Choose it when:** native React and low package overhead are more important than a ready-made advanced assistant runtime.

### 4. Prompt Kit — strongest alternative for copying focused UI

Prompt Kit offers owned source rather than requiring a full assistant framework. Its prompt input uses React and local shadcn components; its scrolling container uses `use-stick-to-bottom`; Markdown pulls in parsing/rendering packages. We can choose only the parts we need, but should inspect each component rather than calling the whole kit dependency-free. [Prompt input source](https://github.com/ibelick/prompt-kit/blob/main/components/prompt-kit/prompt-input.tsx), [Chat container source](https://github.com/ibelick/prompt-kit/blob/main/components/prompt-kit/chat-container.tsx), [Markdown source](https://github.com/ibelick/prompt-kit/blob/main/components/prompt-kit/markdown.tsx)

**Tradeoff:** React 19 fits, but Tailwind/shadcn are new foundations for this repo. Message state, branching, backend communication and persistence remain ours. MIT-licensed. [Requirements](https://github.com/ibelick/prompt-kit/blob/main/llms.txt), [License](https://github.com/ibelick/prompt-kit/blob/main/LICENCE.md)

**Choose it when:** we want to own the visual component code and are willing to adopt that styling stack.

## Important findings in the wider search

### AI Elements is changing distribution

The official legacy site says it is moving to shadcn/ui and will be deprecated at the **end of November 2026**. The successor documentation directs new projects toward shadcn/ui AI components and copied patterns. For a fresh project, follow that destination rather than treating the old `ai-elements` installation as the long-term default. This changes the distribution; it does not eliminate the selected components' dependencies or the work of managing conversation state. [Official announcement](https://elements.ai-sdk.dev/), [Successor documentation](https://ui.shadcn.com/docs/ai-elements)

### Beautiful UI has component-specific setup costs

Its small `ChatComposer` is a useful visual seed with scripted demo behavior. The foundation imports Tailwind CSS and `shadow-plugin/unprefixed`; `PromptBar` declares `glimm`; the README warns that `SidebarNav` uses paid `@central-icons-react` icons. We can adapt or replace those pieces, but that is integration work. MIT licensing for the component source does not cover a separate paid icon dependency. [ChatComposer registry](https://github.com/slev12397/beautiful-ui/blob/main/public/r/chat-composer.json), [Foundation registry](https://github.com/slev12397/beautiful-ui/blob/main/public/r/foundation.json), [PromptBar registry](https://github.com/slev12397/beautiful-ui/blob/main/public/r/prompt-bar.json), [README](https://github.com/slev12397/beautiful-ui)

### Broad design systems are complete in a different sense

Ant Design X is rich in AI-specific visual components and can render static messages without connecting a backend. Its manifest also introduces `antd` as a peer plus its own dependencies. Lobe UI's current implementation has a broad component/runtime ecosystem; it should not be judged using outdated descriptions of older versions. Both are attractive when the application will adopt their design system. They are weaker fits for a bounded chat addition with a small dependency budget. [Ant Design X introduction](https://x.ant.design/components/introduce/), [Manifest](https://github.com/ant-design/x/blob/main/packages/x/package.json), [Lobe UI manifest](https://github.com/lobehub/lobe-ui/blob/master/package.json)

### Lightweight challengers have qualifications

- **NLUX:** its repository describes a modified MPL 2.0 license with added restrictions concerning AI training and code translation tools. Do not classify it as MIT. The official roadmap also lists file uploads and function calling as not yet completed. [Repository/license](https://github.com/nlkitai/nlux), [Feature roadmap](https://docs.nlkit.com/nlux)
- **aparté:** CSS-based theming and optional providers are appealing. “Zero third-party dependencies” applies to the core, not necessarily to all first-party packages and optional Markdown/highlighting integrations. Its own documentation explicitly warns that it is beta and that some minor releases can require changes. [Getting started](https://apartejs.dev/guides/getting-started/), [Stability](https://apartejs.dev/reference/stability/)
- **Loquix:** Lit and Floating UI are real additions. Its site and repository showed differing maturity signals for framework wrappers, so verify the exact published version and React integration rather than assuming every marketing example is an available package. [Manifest](https://github.com/loquix-dev/loquix/blob/main/packages/core/package.json), [Repository roadmap](https://github.com/loquix-dev/loquix), [Website](https://loquix.dev/)

## Maintenance signals

assistant-ui has an active package changelog and migration documentation; Lobe UI lists a 6.5.1 release on 19 October 2026. These are stronger maintenance signals than a large component count alone. [assistant-ui changelog](https://www.assistant-ui.com/changelog), [Lobe UI changelog](https://ui.lobehub.com/changelog)

Chatscope's latest listed release is 2.1.1 from 15 May 2025, adding React 19 peer support. That slower cadence is a consideration, not proof of abandonment. React ChatBotify has a v2 release history, but optional plugins must be evaluated separately. aparté explicitly remains beta. [Chatscope releases](https://github.com/chatscope/chat-ui-kit-react/releases), [ChatBotify releases](https://github.com/react-chatbotify/react-chatbotify/releases), [Plugin guidance](https://react-chatbotify.com/docs/v2/concepts/plugins/), [aparté stability](https://apartejs.dev/reference/stability/)

## How to get started after selecting a library

| Candidate        | First integration step                                                              | UI-only development                          | What to verify in this repo                                                           |
| ---------------- | ----------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------- |
| assistant-ui     | Install core; compose primitives with our CSS, or intentionally adopt styled Thread | LocalRuntime adapter returning local content | React 19/type checks, custom styles, scrolling/cancellation, resolved dependency tree |
| Deep Chat        | Install `deep-chat-react`; mount a styled full-height chat inside our page shell    | Local handler or documented demo stream      | Client-only loading, custom events, styling flexibility, switching conversations      |
| React ChatBotify | Install `react-chatbotify`; use embedded mode and configure styles                  | Local flow, no service required              | React 19/types, SSR boundary, multi-thread ownership, Markdown plugin needs           |
| Prompt Kit       | Establish Tailwind/shadcn; copy only chosen components                              | Pass local messages and event handlers       | Added per-component dependencies and impact of the styling foundation                 |

These are proposed integration paths, not tasks performed during this research. Do not infer production compatibility or bundle savings from them.

Before a final adoption, compare a minimal production build of the top candidates using the **same chat features**. Count resolved transitive dependencies as well as direct additions. Existing shared React should not be counted as newly introduced by just one candidate. No package-size leaderboard is included because none was independently measured here.

## Final recommendation for Slopstagram

**Start the library decision with assistant-ui and Deep Chat.** assistant-ui wins on completeness and React composition; Deep Chat may be the better fit if we want useful chat behavior immediately without adopting a styling framework. ChatBotify deserves a third place in that evaluation because its declared dependency surface is particularly small, with a flow-oriented API as the main compromise.

Prompt Kit is the preferred source-copy alternative if we decide to adopt Tailwind/shadcn. Keep aparté on the experimental shortlist. Beautiful UI remains useful for individual visual ideas, but the wider search does not put it first for a complete bot interface.
