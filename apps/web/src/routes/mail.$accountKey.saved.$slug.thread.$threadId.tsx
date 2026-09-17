import { createFileRoute } from "@tanstack/react-router";

import { MailRoute } from "@/features/mailbox/MailRoute";

export const Route = createFileRoute("/mail/$accountKey/saved/$slug/thread/$threadId")({
  component: MailRoute,
});
