import { createFileRoute } from "@tanstack/react-router";

import { MailRoute } from "@/features/mailbox/MailRoute";

export const Route = createFileRoute("/mail/$accountKey/label/$labelId/thread/$threadId")({
  component: MailRoute,
});
