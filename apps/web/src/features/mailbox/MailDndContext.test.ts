import { describe, expect, test } from "vitest";

import {
  parseMailDragSource,
  resolveMailDrop,
  resolveSidebarDropTarget,
  type MailDragSource,
} from "./MailDndContext";

const source: MailDragSource = {
  type: "mail-row",
  messageIds: ["message-1", "message-2"],
  accountIds: ["account-1"],
};

describe("mailbox drag-and-drop target resolution", () => {
  test("moves a row selection to a user label", () => {
    const sourceFromFolder = { ...source, sourceLabel: "Waiting" };

    expect(
      resolveMailDrop(sourceFromFolder, {
        id: "label:account-1:label-work",
        label: "Work",
        kind: "user-label",
        accountId: "account-1",
      }),
    ).toEqual({
      kind: "mutation",
      action: "move",
      messageIds: ["message-1", "message-2"],
      payload: { label: "Work", sourceLabel: "Waiting" },
    });
  });

  test("preserves the source mailbox from the runtime drag payload", () => {
    expect(
      parseMailDragSource({
        type: "mail-row",
        messageIds: ["message-1"],
        accountIds: ["account-1"],
        sourceLabel: "Waiting",
      }),
    ).toMatchObject({ sourceLabel: "Waiting" });
  });

  test("maps system archive, spam, and trash targets to existing mutations", () => {
    for (const action of ["archive", "spam", "trash"] as const) {
      expect(
        resolveMailDrop(source, {
          id: `system:${action}`,
          label: action,
          kind: "system",
          action,
        }),
      ).toEqual({ kind: "mutation", action, messageIds: source.messageIds });
    }
  });

  test("rejects a known cross-account drop before a mutation is sent", () => {
    const result = resolveMailDrop(source, {
      id: "label:account-2:label-work",
      label: "Work",
      kind: "user-label",
      accountId: "account-2",
    });

    expect(result).toEqual({
      kind: "reject",
      reason: "Messages from another account cannot be dropped here.",
    });
  });

  test("resolves dynamic sidebar labels and explicitly marked system targets", () => {
    expect(
      resolveSidebarDropTarget({
        id: "work",
        label: "Work",
        account_id: "account-1",
        lens: { kind: "label", labelId: "label-work" },
      }),
    ).toMatchObject({ kind: "user-label", label: "Work", accountId: "account-1" });
    expect(
      resolveSidebarDropTarget({
        id: "trash",
        label: "Trash",
        account_id: "account-1",
        lens: { kind: "label", dropAction: "trash" },
      }),
    ).toMatchObject({ kind: "system", action: "trash", accountId: "account-1" });
    expect(
      resolveSidebarDropTarget({
        id: "trash",
        label: "Trash",
        account_id: "account-1",
        lens: { kind: "label", labelId: "label-trash" },
      }),
    ).toMatchObject({ kind: "user-label", label: "Trash", labelId: "label-trash" });
    expect(resolveSidebarDropTarget({ id: "inbox", label: "Inbox", lens: { kind: "inbox" } })).toBe(
      undefined,
    );
  });
});
