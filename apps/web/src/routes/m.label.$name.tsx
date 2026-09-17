import { createFileRoute } from "@tanstack/react-router";

import { LegacyMailRedirect } from "@/features/mailbox/LegacyMailRedirect";

export const Route = createFileRoute("/m/label/$name")({
  component: LegacyMailRedirect,
});
