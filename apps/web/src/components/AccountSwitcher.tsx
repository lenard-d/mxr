import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, Mail, Settings, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveAccount } from "@/features/accounts/useActiveAccount";

interface AccountSwitcherProps {
  collapsed?: boolean;
}

export function AccountSwitcher({ collapsed = false }: AccountSwitcherProps) {
  const { account, accounts, rows } = useActiveAccount();
  const displayAccount = account ?? { name: "All accounts", email: "" };
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 w-full justify-start gap-2 px-2 text-left"
          aria-label="Account switcher"
        >
          <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary-muted text-primary">
            <Mail className="size-3" />
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium leading-tight">
                  {displayAccount.name}
                </div>
                {displayAccount.email ? (
                  <div className="truncate font-mono text-2xs text-muted-foreground">
                    {displayAccount.email}
                  </div>
                ) : null}
              </div>
              <ChevronDown className="size-3 shrink-0 opacity-60" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Accounts</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {accounts.isLoading ? (
          <DropdownMenuItem disabled className="text-2xs text-muted-foreground">
            Loading accounts...
          </DropdownMenuItem>
        ) : rows.length === 0 ? (
          <DropdownMenuItem disabled className="text-2xs text-muted-foreground">
            No accounts loaded yet
          </DropdownMenuItem>
        ) : (
          rows.map((row) => (
            <DropdownMenuItem key={row.account_id} disabled={!row.enabled} asChild={row.enabled}>
              {row.enabled ? (
                <Link
                  to="/m/$mailbox"
                  params={{ mailbox: "inbox" }}
                  search={(previous) => ({ ...previous, account: row.account_id })}
                >
                  <Mail className="size-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{row.name || row.email}</span>
                    <span className="block truncate font-mono text-2xs text-muted-foreground">
                      {row.email}
                    </span>
                  </span>
                  {account?.account_id === row.account_id ? (
                    <Check className="size-3 text-primary" aria-label="Selected account" />
                  ) : row.is_default ? (
                    <span className="rounded bg-primary-muted px-1 text-2xs text-primary">
                      default
                    </span>
                  ) : null}
                </Link>
              ) : (
                <>
                  <Mail className="size-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{row.name || row.email}</span>
                    <span className="block truncate font-mono text-2xs text-muted-foreground">
                      {row.email}
                    </span>
                  </span>
                  <span className="text-2xs text-muted-foreground">disabled</span>
                </>
              )}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/accounts/$key" params={{ key: "new" }}>
            <UserPlus className="size-3" /> Add account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/accounts">
            <Settings className="size-3" /> Manage accounts
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
