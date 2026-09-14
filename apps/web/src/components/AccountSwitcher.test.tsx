/* @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AccountSwitcher } from "./AccountSwitcher";

const accountState = vi.hoisted(() => ({
  rows: [
    {
      account_id: "account-1",
      key: "work",
      name: "Work",
      email: "work@example.com",
      provider_kind: "gmail",
      enabled: true,
      is_default: true,
    },
    {
      account_id: "account-2",
      key: "personal",
      name: "Personal",
      email: "me@example.com",
      provider_kind: "imap",
      enabled: true,
      is_default: false,
    },
  ],
}));

vi.mock("@/features/accounts/useActiveAccount", () => ({
  useActiveAccount: () => ({
    account: accountState.rows[1],
    accounts: { isLoading: false },
    rows: accountState.rows,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    search,
    to,
    ...props
  }: {
    children: ReactNode;
    onClick?: () => void;
    params?: Record<string, string>;
    search?:
      | Record<string, string>
      | ((previous: Record<string, string>) => Record<string, string>);
    to: string;
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (value, [key, parameter]) => value.replace(`$${key}`, parameter),
      to,
    );
    const values = typeof search === "function" ? search({}) : search;
    const query = values ? `?${new URLSearchParams(values).toString()}` : "";
    return (
      <a href={`${path}${query}`} {...props}>
        {children}
      </a>
    );
  },
}));

describe("AccountSwitcher", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("shows the selected account and links each account to its inbox", async () => {
    render(<AccountSwitcher />);

    expect(screen.getByText("Personal")).toBeVisible();
    expect(screen.getByText("me@example.com")).toBeVisible();

    fireEvent.pointerDown(screen.getByRole("button", { name: /account switcher/i }), {
      button: 0,
      ctrlKey: false,
    });

    expect(await screen.findByText("default")).toBeVisible();
    expect(screen.getByText("work@example.com").closest("a")).toHaveAttribute(
      "href",
      "/m/inbox?account=account-1",
    );
    expect(screen.getByLabelText("Selected account")).toBeVisible();
    expect(screen.queryByText(/no accounts loaded/i)).not.toBeInTheDocument();
  });
});
