/* @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { MailboxStatusFilter } from "./MailboxStatusFilter";
import type { MailboxStatusFilter as MailboxStatusFilterValue } from "./statusFilter";

describe("MailboxStatusFilter", () => {
  test("exposes each supported status and changes the selected filter", () => {
    const onChange = vi.fn<(value: MailboxStatusFilterValue) => void>();

    render(<MailboxStatusFilter value="all" onChange={onChange} />);

    expect(screen.getByRole("group", { name: "Filter mailbox by status" })).toBeVisible();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "All",
      "Unread",
      "Read",
      "Starred",
    ]);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Unread" }));

    expect(onChange).toHaveBeenCalledWith("unread");
  });
});
