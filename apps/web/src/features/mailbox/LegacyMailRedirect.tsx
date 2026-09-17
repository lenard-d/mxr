import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { fetchAccounts } from "@/features/accounts/api";

import {
  accountKeyFor,
  buildMailPath,
  defaultRuntimeAccount,
  parseMailLocation,
} from "./location";

export function LegacyMailRedirect() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const location = parseMailLocation(pathname);
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
    staleTime: 60_000,
    retry: false,
  });
  const defaultAccount = defaultRuntimeAccount(accounts.data?.accounts ?? []);
  const target =
    location && defaultAccount
      ? buildMailPath({
          accountKey: accountKeyFor(defaultAccount),
          lens: location.lens,
          threadId: location.threadId,
        })
      : undefined;

  useEffect(() => {
    if (target) void navigate({ to: target });
  }, [navigate, target]);

  if (accounts.isError) {
    return (
      <EmptyState
        role="alert"
        icon={RefreshCw}
        title="Mailbox unavailable"
        description={`Could not load accounts: ${accounts.error.message}`}
        action={<Button onClick={() => accounts.refetch()}>Retry</Button>}
      />
    );
  }

  if (accounts.isSuccess && !defaultAccount) {
    return (
      <EmptyState
        icon={RefreshCw}
        title="No mailbox account"
        description="Add or enable an account before opening the mailbox."
        action={<Button onClick={() => void navigate({ to: "/accounts" })}>Open accounts</Button>}
      />
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
      Opening mailbox…
    </div>
  );
}
