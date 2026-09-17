import { useInfiniteQuery, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";

import { fetchAccounts } from "@/features/accounts/api";
import type { RuntimeAccount } from "@/features/compose/api";
import {
  fetchMailbox,
  fetchShell,
  mailboxKey,
  shellQueryKey,
  type MailboxLensParams,
} from "./api";
import {
  parseMailLocation,
  resolveMailAccount,
  type MailAccountResolution,
  type MailLocation,
} from "./location";
import type { MailboxResponse, MessageGroupView, ShellResponse, SidebarItem } from "./types";

const MAILBOX_PAGE_SIZE = 200;

interface MailContext {
  pathname: string;
  location: MailLocation | null;
  accountQuery: UseQueryResult<{ accounts: RuntimeAccount[] }>;
  accountResolution: MailAccountResolution;
  accountId?: string;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function itemsFromShell(shell?: ShellResponse): SidebarItem[] {
  return shell?.sidebar?.sections?.flatMap((section) => section.items) ?? [];
}

function withAccountId(accountId: string | undefined, lens: MailboxLensParams): MailboxLensParams {
  return accountId ? { account_id: accountId, ...lens } : lens;
}

function lensFromItem(
  item: SidebarItem | undefined,
  accountId: string | undefined,
): MailboxLensParams | undefined {
  const lens = item?.lens;
  if (!lens) return undefined;
  if (lens.kind === "label" && lens.labelId) {
    return withAccountId(accountId, { lens_kind: "label", label_id: lens.labelId });
  }
  if (lens.kind === "saved_search" && lens.savedSearch) {
    return withAccountId(accountId, { lens_kind: "saved_search", saved_search: lens.savedSearch });
  }
  if (lens.kind === "subscription" && lens.senderEmail) {
    return withAccountId(accountId, { lens_kind: "subscription", sender_email: lens.senderEmail });
  }
  if (lens.kind === "all_mail") return withAccountId(accountId, { lens_kind: "all_mail" });
  if (lens.kind === "inbox") return withAccountId(accountId, { lens_kind: "inbox" });
  return undefined;
}

export function resolveMailboxLens(
  pathname: string,
  shell?: ShellResponse,
  accountId?: string,
): MailboxLensParams {
  const location = parseMailLocation(pathname);
  if (!location) return withAccountId(accountId, { lens_kind: "inbox" });

  if (location.lens.kind === "inbox") {
    return withAccountId(accountId, { lens_kind: "inbox" });
  }
  if (location.lens.kind === "archive") {
    return withAccountId(accountId, { lens_kind: "all_mail" });
  }

  const items = itemsFromShell(shell);
  if (location.lens.kind === "saved") {
    const target = location.lens.slug;
    const item = items.find(
      (candidate) =>
        candidate.id === `saved-search-${target}` || slugify(candidate.label) === target,
    );
    return (
      lensFromItem(item, accountId) ??
      withAccountId(accountId, { lens_kind: "saved_search", saved_search: target })
    );
  }

  const target = location.lens.labelId;
  const item = items.find(
    (candidate) => candidate.id === target || slugify(candidate.label) === target,
  );
  return (
    lensFromItem(item, accountId) ??
    withAccountId(accountId, { lens_kind: "label", label_id: target })
  );
}

function useMailContext(): MailContext {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const location = parseMailLocation(pathname);
  const accountQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
    staleTime: 60_000,
    retry: false,
  });
  const accountKey = location?.source === "canonical" ? location.accountKey : undefined;
  const accountResolution = accountQuery.isSuccess
    ? resolveMailAccount(accountKey, accountQuery.data.accounts)
    : accountKey
      ? { status: "loading", accountKey }
      : { status: "all", accountKey: "all" };
  const accountId = accountResolution.status === "resolved" ? accountResolution.accountId : undefined;
  return { pathname, location, accountQuery, accountResolution, accountId };
}

export function useShellQuery() {
  const context = useMailContext();
  const canLoadShell =
    !context.accountQuery.isError &&
    (context.accountResolution.status === "resolved" || context.accountResolution.status === "all");
  const shell = useQuery({
    queryKey: shellQueryKey(context.accountId),
    queryFn: () => fetchShell(context.accountId),
    enabled: canLoadShell,
    staleTime: 30_000,
  });
  return {
    ...shell,
    accountQuery: context.accountQuery,
    accountResolution: context.accountResolution,
    accountId: context.accountId,
    location: context.location,
    pathname: context.pathname,
  };
}

export function useMailboxQuery() {
  const shell = useShellQuery();
  const lens = resolveMailboxLens(shell.pathname, shell.data, shell.accountId);
  const query = useInfiniteQuery({
    queryKey: mailboxKey({ ...lens, view: "threads", limit: MAILBOX_PAGE_SIZE }),
    queryFn: ({ pageParam }) =>
      fetchMailbox({ ...lens, view: "threads", limit: MAILBOX_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // Saved-search runs can't paginate: Request::RunSavedSearch takes no
      // offset. A subscription drilldown (sender_email set) runs through
      // Request::Search, which does — the bridge reports has_more for it.
      if (lens.lens_kind === "saved_search") return undefined;
      if (lens.lens_kind === "subscription" && !lens.sender_email) return undefined;
      if (lastPage.mailbox.has_more && typeof lastPage.mailbox.next_offset === "number") {
        return lastPage.mailbox.next_offset;
      }
      const loadedPages = allPages.length;
      const lastPageRows = lastPage.mailbox.groups.reduce(
        (total, group) => total + group.rows.length,
        0,
      );
      return lastPageRows >= MAILBOX_PAGE_SIZE ? loadedPages * MAILBOX_PAGE_SIZE : undefined;
    },
    select: (data) => mergeMailboxPages(data.pages),
    enabled: shell.isSuccess,
    staleTime: 10_000,
  });
  return {
    ...query,
    accountQuery: shell.accountQuery,
    accountResolution: shell.accountResolution,
    accountId: shell.accountId,
    location: shell.location,
  };
}

function mergeMailboxPages(pages: MailboxResponse[]): MailboxResponse | undefined {
  const first = pages[0];
  if (!first) return undefined;

  const groups: MessageGroupView[] = [];
  const groupIndexes = new Map<string, number>();
  const seenRows = new Set<string>();

  for (const page of pages) {
    for (const group of page.mailbox.groups) {
      const rows = group.rows.filter((row) => {
        if (seenRows.has(row.id)) return false;
        seenRows.add(row.id);
        return true;
      });
      if (rows.length === 0) continue;

      const existingIndex = groupIndexes.get(group.id);
      if (existingIndex === undefined) {
        groupIndexes.set(group.id, groups.length);
        groups.push({ ...group, rows });
      } else {
        const existing = groups[existingIndex];
        if (!existing) continue;
        groups[existingIndex] = {
          ...existing,
          rows: [...existing.rows, ...rows],
        };
      }
    }
  }

  return {
    ...first,
    mailbox: {
      ...first.mailbox,
      groups,
    },
  };
}
