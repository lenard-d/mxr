import { useConnectionStore } from "@/state/connectionStore";

export function SyncProgressPill() {
  const sync = useConnectionStore((s) => s.syncProgress);
  if (!sync) return null;
  return (
    <span
      role="status"
      data-sync-progress
      className="inline-flex h-6 shrink-0 items-center rounded-full border border-primary/30 bg-primary-muted px-2.5 font-mono text-2xs text-foreground"
    >
      Syncing {sync.current} of {sync.total}
    </span>
  );
}
