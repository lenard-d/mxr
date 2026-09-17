import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { MoreHorizontal, Pencil } from "lucide-react";

import { DensityToggle } from "@/components/DensityToggle";
import { MobileNavigation } from "@/components/MobileNavigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SearchInput } from "@/features/search/SearchInput";
import { fetchAdminStatus } from "@/features/diagnostics/api";
import { useModals } from "@/state/modalStore";
import { isDensity, useUiPrefs, type Density } from "@/state/uiPrefsStore";

const densityOptions: Array<{ id: Density; label: string; description: string }> = [
  { id: "compact", label: "Compact", description: "More messages on screen" },
  { id: "regular", label: "Regular", description: "Balanced spacing" },
  { id: "comfortable", label: "Comfortable", description: "More room to scan" },
];

export function Topbar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const setComposeOpen = useModals((state) => state.setComposeLauncherOpen);

  // Surface a small chip whenever the bridge is bound to the demo profile.
  // Polled lazily; status is cheap and stable for the session.
  const { data: status } = useQuery({
    queryKey: ["admin-status-is-demo"],
    queryFn: fetchAdminStatus,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const isDemo = Boolean((status as { is_demo?: boolean } | undefined)?.is_demo);

  return (
    <div className="flex min-w-0 w-full items-center gap-2 sm:gap-3">
      <MobileNavigation />
      <div className="hidden min-w-0 flex-1 sm:block">
        <Breadcrumb path={path} />
      </div>

      {isDemo ? <DemoChip /> : null}

      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none">
        <SearchInput />
        <div className="hidden shrink-0 md:block">
          <DensityToggle />
        </div>
        <TopbarOverflowMenu />
        <Button
          size="sm"
          className="h-10 w-10 p-0 sm:h-8 sm:w-auto sm:px-3"
          onClick={() => setComposeOpen(true)}
          aria-label="Compose new email"
        >
          <Pencil className="size-3.5" />
          <span className="hidden sm:inline">Compose</span>
        </Button>
      </div>
    </div>
  );
}

function TopbarOverflowMenu() {
  const density = useUiPrefs((state) => state.density);
  const setDensity = useUiPrefs((state) => state.setDensity);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="shrink-0 md:hidden"
          aria-label="More display options"
        >
          <MoreHorizontal className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Mailbox density</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={density}
          onValueChange={(value) => {
            if (isDensity(value)) setDensity(value);
          }}
        >
          {densityOptions.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id} className="min-h-10">
              <span className="flex min-w-0 flex-col">
                <span className="text-xs font-medium">{option.label}</span>
                <span className="text-2xs text-muted-foreground">{option.description}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DemoChip() {
  return (
    <span
      className="hidden shrink-0 rounded-sm bg-warning px-1.5 py-0.5 font-mono text-2xs font-semibold text-warning-foreground sm:inline-flex"
      title="Demo profile — no real mail is being touched"
      aria-label="Demo mode active"
    >
      DEMO
    </span>
  );
}

function Breadcrumb({ path }: { path: string }) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return <div className="font-mono text-2xs text-muted-foreground">/</div>;
  return (
    <div className="flex min-w-0 items-center gap-1 truncate font-mono text-2xs text-muted-foreground">
      <span>/</span>
      {parts.map((part, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <span key={i} className="flex min-w-0 items-center gap-1">
          <span className={i === parts.length - 1 ? "truncate text-foreground" : "truncate"}>
            {decodeURIComponent(part)}
          </span>
          {i < parts.length - 1 && <span>/</span>}
        </span>
      ))}
    </div>
  );
}
