import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, retainSearchParams } from "@tanstack/react-router";
import { z } from "zod";

import { AppShell } from "@/components/AppShell";

interface RouterContext {
  queryClient: QueryClient;
}

const rootSearchSchema = z.object({
  account: z.string().optional(),
});

export const Route = createRootRouteWithContext<RouterContext>()({
  validateSearch: rootSearchSchema,
  search: {
    middlewares: [retainSearchParams(["account"])],
  },
  component: AppShell,
});
