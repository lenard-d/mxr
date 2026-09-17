import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Pencil } from "lucide-react";

import { MobileNavigation } from "@/components/MobileNavigation";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/features/search/SearchInput";
import { fetchAdminStatus } from "@/features/diagnostics/api";
import { useModals } from "@/state/modalStore";

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
        {path === "/search" ? null : <SearchInput />}
        <Button
          size="sm"
          variant="default"
          className="compose-primary h-10 w-10 p-0 shadow-sm sm:h-8 sm:w-auto sm:px-3"
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
  const rawParts = path.split("/").filter(Boolean);
  const threadSegment = rawParts.indexOf("thread");
  const parts = threadSegment >= 0 ? rawParts.slice(0, threadSegment) : rawParts;
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
