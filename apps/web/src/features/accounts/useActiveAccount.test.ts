import { describe, expect, test } from "vitest";

import type { RuntimeAccount } from "@/features/compose/api";

import { resolveActiveAccount } from "./useActiveAccount";

const accounts: RuntimeAccount[] = [
  {
    account_id: "account-1",
    name: "Work",
    email: "work@example.com",
    provider_kind: "gmail",
    enabled: true,
    is_default: true,
  },
  {
    account_id: "account-2",
    name: "Personal",
    email: "me@example.com",
    provider_kind: "imap",
    enabled: true,
    is_default: false,
  },
];

describe("resolveActiveAccount", () => {
  test("uses the account selected in the URL", () => {
    expect(resolveActiveAccount(accounts, "account-2")?.email).toBe("me@example.com");
  });

  test("falls back to the default account for an unknown selection", () => {
    expect(resolveActiveAccount(accounts, "missing")?.email).toBe("work@example.com");
  });

  test("does not select a disabled account", () => {
    const disabled = [
      accounts[0],
      {
        account_id: "account-2",
        name: "Personal",
        email: "me@example.com",
        provider_kind: "imap",
        enabled: false,
        is_default: false,
      },
    ].filter((account): account is RuntimeAccount => account !== undefined);
    expect(resolveActiveAccount(disabled, "account-2")?.email).toBe("work@example.com");
  });
});
