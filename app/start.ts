import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

// Server functions are same-origin RPC endpoints: refuse the ones called from another site.
const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
}));
