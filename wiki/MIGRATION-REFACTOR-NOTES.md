# Refactor candidates after the stack migration

These are follow-up proposals, not changes to implement as part of the migration.
The migration keeps `server/pages`, `server/components`, the query service, Nitro
routes and plugins, the SDK, and the existing data model.

| Candidate                                                                          | Why consider it                                                                                                                                                                    | What to verify before changing it                                                                                                                  |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consolidate the repeated 404 translation in `server/query-service.ts`              | Both server functions convert Nitro handler errors into TanStack not-found responses. A common boundary could keep that behavior consistent as more queries are added.             | Page requests must still return 404, and Nitro API responses must retain their current error behavior.                                             |
| Give page-data types their own module                                              | Server handlers currently import prop types from page modules. A dedicated contract could reduce coupling between data loading and presentation.                                   | Keep server dependencies out of client bundles and preserve server-function serialization types.                                                   |
| Consider TanStack links and client navigation for user links and the report picker | Existing anchors and the GET form perform full document navigation. Client navigation could reuse loaded assets and route data.                                                    | Preserve URLs, browser history, direct links, form behavior, and report selection.                                                                 |
| Review timeline response size                                                      | Timeline props contain stories in several representations for grouping, display, and the lightbox. A smaller payload could reduce SSR hydration and server-function response size. | Measure real report sizes first; preserve publication ordering, annotations, and all lightbox details.                                             |
| Simplify redundant JSX fragments and single-string `clsx` calls                    | Several wrappers and class helpers can be expressed more directly. They have been retained to keep the migration focused.                                                          | Confirm rendered markup and styles are unchanged.                                                                                                  |
| Review bunqueue child-process shutdown                                             | The existing plugin launches bunqueue through npm. Stopping npm can leave its Bun child running; this happened during migration smoke-test cleanup.                                | Test development shutdown, production termination, startup failures, and ownership of an already-running queue before changing process management. |

## Migration-specific decisions

- Configure TanStack Start with `srcDirectory: "server"` and `routesDirectory: "pages"`; no `src` folder is needed.
- Keep data access behind `server/query-service.ts` using TanStack Start server functions, called from route loaders.
- Read page search state with `Route.useSearch()` and pass the selected story to the shared lightbox.
- Use TanStack's `parseSearchWith(String)` and `stringifySearchWith(JSON.stringify)`, with route search schemas normalizing primitives to strings. This preserves existing numeric Instagram story IDs without a custom query-string implementation.
- Use Nitro's `/` redirect rule to send document requests to `/report`; no duplicate TanStack index page is needed while home links use normal anchors.
- Use TanStack's `$username.tsx` route filename in the existing `server/pages/users` directory.
- Use a React callback ref to open and clean up the native dialog, respecting the project's restriction on effect hooks.
