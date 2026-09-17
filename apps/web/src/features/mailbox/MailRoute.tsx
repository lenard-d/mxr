import { useRouterState } from "@tanstack/react-router";

import { ThreadRoute } from "@/features/thread/ThreadRoute";

import { MailboxRoute } from "./MailboxRoute";
import { parseMailLocation } from "./location";

export function MailRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const location = parseMailLocation(pathname);
  return location?.threadId ? <ThreadRoute /> : <MailboxRoute />;
}
