import { useMutation } from "@tanstack/react-query";
import { useRouterState, useNavigate } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MailboxList } from "./MailboxList";
import { SyncProgressBanner } from "./SyncProgressBanner";
import { MailboxStatusFilter } from "./MailboxStatusFilter";
import {
  filterMailboxGroups,
  type MailboxStatusFilter as MailboxStatusFilterValue,
} from "./statusFilter";
import { useMailboxQuery } from "./useMailboxQuery";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/api/client";
import {
  accountKeyFor,
  buildMailInboxPath,
  mailboxPathFromLocation,
  parseMailLocation,
  type MailAccountResolution,
} from "@/features/mailbox/location";
import { useMailboxPane } from "@/state/mailboxPaneStore";

export function MailboxRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const location = parseMailLocation(pathname);
  const activeThreadId = location?.threadId;
  const activePane = useMailboxPane((state) => state.activePane);
  const setActivePane = useMailboxPane((state) => state.setActivePane);
  const [statusFilter, setStatusFilter] = useState<MailboxStatusFilterValue>("all");
  const mailbox = useMailboxQuery();
  const sync = useMutation({
    mutationFn: () => apiFetch<{ accepted?: boolean }>("/api/v1/mail/sync", { method: "POST" }),
    onSuccess: () => toast.info("Checking for new mail"),
    onError: (error) => toast.error("Could not fetch new mail", { description: error.message }),
  });

  useEffect(() => {
    if (!activeThreadId && activePane === "reader") setActivePane("mailbox");
  }, [activePane, activeThreadId, setActivePane]);

  if (mailbox.accountQuery.isError) {
    return (
      <EmptyState
        role="alert"
        icon={RefreshCw}
        title="Accounts unavailable"
        description={mailbox.accountQuery.error.message}
        action={<Button onClick={() => mailbox.accountQuery.refetch()}>Retry</Button>}
      />
    );
  }

  if (
    mailbox.accountResolution.status === "invalid" ||
    mailbox.accountResolution.status === "disabled"
  ) {
    return <AccountUnavailable resolution={mailbox.accountResolution} />;
  }

  if (mailbox.isLoading || mailbox.accountResolution.status === "loading") {
    return (
      <div className="flex min-w-0 flex-1 flex-col lg:border-r lg:border-border">
        <div className="space-y-0 p-3">
          {Array.from({ length: 12 }, (_, index) => (
            <div key={index} className="mb-2 h-12 animate-pulse rounded-md bg-muted/60" />
          ))}
        </div>
      </div>
    );
  }

  if (mailbox.isError) {
    return (
      <EmptyState
        icon={RefreshCw}
        title="Mailbox unavailable"
        description={mailbox.error.message}
        action={<Button onClick={() => mailbox.refetch()}>Retry</Button>}
      />
    );
  }

  const data = mailbox.data;
  if (!data || !location) return null;
  const accountKey =
    mailbox.accountResolution.status === "resolved"
      ? mailbox.accountResolution.accountKey
      : (location.accountKey ?? "all");
  const mailboxPath = mailboxPathFromLocation(location, accountKey);
  const visibleGroups = filterMailboxGroups(data.mailbox.groups, statusFilter);

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-background lg:border-r lg:border-border">
      <SyncProgressBanner />
      <MailboxList
        groups={visibleGroups}
        mailboxPath={mailboxPath}
        activeThreadId={activeThreadId}
        previewOnFocus={Boolean(activeThreadId)}
        hasMore={mailbox.hasNextPage}
        loadingMore={mailbox.isFetchingNextPage}
        onLoadMore={() => {
          void mailbox.fetchNextPage();
        }}
        onRefresh={() => sync.mutate()}
        refreshing={sync.isPending}
        toolbarEnd={<MailboxStatusFilter value={statusFilter} onChange={setStatusFilter} />}
      />
    </div>
  );
}

function AccountUnavailable({
  resolution,
}: {
  resolution: Extract<MailAccountResolution, { status: "invalid" | "disabled" }>;
}) {
  const navigate = useNavigate();
  const fallback = resolution.fallback;
  const title = resolution.status === "disabled" ? "Account disabled" : "Account not found";
  const detail =
    resolution.status === "disabled"
      ? `${resolution.account.name || resolution.account.email} is disabled.`
      : `No enabled account matches “${resolution.accountKey}”.`;
  return (
    <EmptyState
      role="alert"
      icon={RefreshCw}
      title={title}
      description={detail}
      action={
        fallback ? (
          <Button
            onClick={() => void navigate({ to: buildMailInboxPath(accountKeyFor(fallback)) })}
          >
            Open {fallback.name || fallback.email}
          </Button>
        ) : (
          <Button onClick={() => void navigate({ to: "/accounts" })}>Open accounts</Button>
        )
      }
    />
  );
}
