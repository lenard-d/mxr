import { describe, expect, test } from "vitest";

import type { MessageGroupView, MessageRowView } from "./types";
import { filterMailboxGroups, type MailboxStatusFilter } from "./statusFilter";

function row(id: string, unread: boolean, starred: boolean): MessageRowView {
  return {
    id,
    kind: "thread",
    thread_id: `thread-${id}`,
    provider_id: `provider-${id}`,
    sender: `${id}@example.com`,
    subject: id,
    snippet: "Snippet",
    date: "2026-05-11T10:00:00Z",
    date_label: "May 11",
    date_full: "May 11, 2026, 10:00 AM",
    date_relative: "now",
    unread,
    starred,
    has_attachments: false,
  };
}

const groups: MessageGroupView[] = [
  {
    id: "today",
    label: "Today",
    rows: [row("unread", true, false), row("read", false, false)],
  },
  {
    id: "yesterday",
    label: "Yesterday",
    rows: [row("starred", false, true)],
  },
];

describe("filterMailboxGroups", () => {
  test.each([
    ["all", ["unread", "read", "starred"]],
    ["unread", ["unread"]],
    ["read", ["read", "starred"]],
    ["starred", ["starred"]],
  ] as const)(
    "filters the mailbox rows for %s",
    (filter: MailboxStatusFilter, expected) => {
      const filtered = filterMailboxGroups(groups, filter);

      expect(filtered.flatMap((group) => group.rows.map((mail) => mail.id))).toEqual(expected);
    },
  );

  test("removes empty date groups after filtering", () => {
    const filtered = filterMailboxGroups(groups, "starred");

    expect(filtered.map((group) => group.id)).toEqual(["yesterday"]);
    expect(filtered[0]?.label).toBe("Yesterday");
  });
});
