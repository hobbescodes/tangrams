import { server as mswServer } from "@examples/shared/mocks/node";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

// Start MSW server before handling any requests
mswServer.listen({ onUnhandledRequest: "bypass" });

export default createServerEntry({
  fetch(request) {
    return handler.fetch(request);
  },
});
