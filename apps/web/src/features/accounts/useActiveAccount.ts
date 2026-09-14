import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";

import { fetchAccounts } from "@/features/accounts/api";
import type { RuntimeAccount } from "@/features/compose/api";

export function resolveActiveAccount(
  accounts: RuntimeAccount[],
  selectedAccountId?: string,
): RuntimeAccount | undefined {
  return (
    accounts.find((account) => account.enabled && account.account_id === selectedAccountId) ??
    accounts.find((account) => account.enabled && account.is_default) ??
    accounts.find((account) => account.enabled) ??
    accounts[0]
  );
}

export function useActiveAccount() {
  const selectedAccountId = useRouterState({
    select: (state) => state.location.search?.account,
  });
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
    staleTime: 60_000,
  });
  const rows = accounts.data?.accounts ?? [];

  return {
    accounts,
    rows,
    selectedAccountId,
    account: resolveActiveAccount(rows, selectedAccountId),
  };
}
