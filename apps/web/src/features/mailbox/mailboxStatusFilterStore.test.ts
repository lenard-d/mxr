/* @vitest-environment jsdom */

import { beforeEach, describe, expect, test } from "vitest";

import { useMailboxStatusFilter } from "./mailboxStatusFilterStore";

describe("mailbox status filter store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useMailboxStatusFilter.setState({ value: "all" });
  });

  test("keeps the selected filter when the mailbox route remounts", async () => {
    useMailboxStatusFilter.getState().setValue("starred");

    await useMailboxStatusFilter.persist.rehydrate();

    expect(useMailboxStatusFilter.getState().value).toBe("starred");
  });
});
