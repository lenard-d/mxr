import { useQuery } from "@tanstack/react-query";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, type CSSProperties } from "react";
import { toast } from "sonner";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { HelpDialog } from "@/components/HelpDialog";
import { OfflineBanner } from "@/components/OfflineBanner";
import { RightRail } from "@/components/RightRail";
import { Sidebar } from "@/components/Sidebar";
import { StatusBar } from "@/components/StatusBar";
import { Topbar } from "@/components/Topbar";
import { CommandPaletteMount } from "@/features/command-palette/CommandPalette";
import { ComposeHost } from "@/features/compose/ComposeHost";
import { ComposeLauncher } from "@/features/compose/ComposeLauncher";
import { MailDndProvider } from "@/features/mailbox/MailDndContext";
import { SearchPalette } from "@/features/search/SearchPalette";
import { fetchAccounts } from "@/features/accounts/api";
import { useNewMessageNotifier } from "@/features/notifications/useNewMessageNotifier";
import { useKeybindings } from "@/hooks/useKeybindings";
import { buildGlobalKeymap } from "@/lib/keymap";
import { useMailboxPane } from "@/state/mailboxPaneStore";
import { useModals } from "@/state/modalStore";
import { useUiPrefs } from "@/state/uiPrefsStore";

const G_A_MIGRATION_KEY = "mxr.shortcut.ga-migration-shown.v1";

export function AppShell() {
  const sidebarCollapsed = useUiPrefs((s) => s.sidebarCollapsed);
  const sidebarWidth = useUiPrefs((s) => s.sidebarWidth);
  const rightRail = useModals((s) => s.rightRail);
  const closeRightRail = useModals((s) => s.closeRightRail);
  const helpOpen = useModals((s) => s.helpOpen);
  const setHelpOpen = useModals((s) => s.setHelpOpen);
  const activePane = useMailboxPane((s) => s.activePane);
  const navigate = useNavigate();
  const path = useRouterState({ select: (state) => state.location.pathname });
  useNewMessageNotifier();
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
    retry: false,
    staleTime: 60_000,
  });
  const keymap = useMemo(
    () => buildGlobalKeymap({ navigate: (to) => navigate({ to }) }),
    [navigate],
  );
  useKeybindings(keymap, { disabled: path.startsWith("/compose") });

  // Auto-close right rail on full route change to avoid stale context
  useEffect(() => {
    return () => useModals.getState().closeRightRail();
  }, []);

  // One-time migration notice: `g a` used to open Analytics in some surfaces;
  // it now consistently opens All Mail (matches Gmail + the global keymap).
  // Analytics moved to `g y`. Suppressed after first display.
  useEffect(() => {
    if (path !== "/m/archive") return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(G_A_MIGRATION_KEY)) return;
    toast.info("`g a` now opens All Mail. Analytics moved to `g y`. Press ? for the full list.", {
      duration: 8000,
      onDismiss: () => window.localStorage.setItem(G_A_MIGRATION_KEY, "1"),
      onAutoClose: () => window.localStorage.setItem(G_A_MIGRATION_KEY, "1"),
    });
  }, [path]);

  useEffect(() => {
    if (path !== "/onboarding" && accounts.data?.accounts.length === 0) {
      void navigate({ to: "/onboarding" });
    }
  }, [accounts.data?.accounts.length, navigate, path]);

  return (
    <MailDndProvider>
      <div
        className="app-shell"
        data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
        data-rightrail-open={rightRail ? "true" : "false"}
        style={{ "--shell-sidebar-w": `${sidebarWidth}px` } as CSSProperties}
      >
        <div className="app-shell-sidebar">
          <Sidebar />
        </div>
        <div className="app-shell-topbar">
          <Topbar />
        </div>
        <div className="app-shell-main">
          <OfflineBanner />
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
        {rightRail ? (
          <div
            className="app-shell-rightrail"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) closeRightRail();
            }}
          >
            <RightRail />
          </div>
        ) : null}
        <div className="app-shell-statusbar">
          <StatusBar />
        </div>
      </div>
      <CommandPaletteMount />
      <ComposeLauncher />
      <ComposeHost />
      <SearchPalette />
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} path={path} activePane={activePane} />
    </MailDndProvider>
  );
}
