import type { MessageGroupView, MessageRowView } from "./types";

export const MAILBOX_STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
  { value: "starred", label: "Starred" },
] as const;

export type MailboxStatusFilter = (typeof MAILBOX_STATUS_FILTERS)[number]["value"];

export function filterMailboxGroups(
  groups: readonly MessageGroupView[],
  filter: MailboxStatusFilter,
): MessageGroupView[] {
  if (filter === "all") return [...groups];

  return groups.flatMap((group) => {
    const rows = group.rows.filter((row) => matchesStatus(row, filter));
    return rows.length > 0 ? [{ ...group, rows }] : [];
  });
}

function matchesStatus(row: MessageRowView, filter: Exclude<MailboxStatusFilter, "all">): boolean {
  switch (filter) {
    case "unread":
      return row.unread;
    case "read":
      return !row.unread;
    case "starred":
      return row.starred;
    default: {
      const exhaustive: never = filter;
      return exhaustive;
    }
  }
}
