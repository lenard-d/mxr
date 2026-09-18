import { useVirtualizer } from "@tanstack/react-virtual";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { BulkActionBar } from "./BulkActionBar";
import type { MailDragSource } from "./MailDndContext";
import { MailboxRow } from "./MailboxRow";
import type { MessageGroupView, MessageRowView } from "./types";
import { useOptimisticMailMutation } from "./useOptimisticMailMutation";
import { EmptyState } from "@/components/EmptyState";
import { useShortcutScope } from "@/hooks/useShortcutScope";
import {
  getShortcutValues,
  isShortcutSequencePrefix,
  isShortcutSuppressed,
  matchesShortcutSequence,
  type ShortcutActionId,
} from "@/lib/keybindings";
import { useKeyScope } from "@/state/keyScopeStore";
import { useMailboxPane } from "@/state/mailboxPaneStore";
import { useSelection } from "@/state/selectionStore";
import { useUiPrefs } from "@/state/uiPrefsStore";
import { buildMailThreadPathFromMailboxPath } from "@/features/mailbox/location";
import { Inbox } from "lucide-react";

interface MailboxListProps {
  groups: MessageGroupView[];
  mailboxPath: string;
  activeThreadId?: string;
  previewOnFocus?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /**
   * Read-only lists drop selection, bulk actions, and message mutations
   * (star/archive/read/etc.) — keeping navigation and open. Use for
   * lists whose rows aren't directly mutable messages (e.g. stale
   * thread aggregates with no message id).
   */
  readOnly?: boolean;
  /** Optional per-row trailing control, e.g. a list-specific action. */
  rowAction?: (row: MessageRowView) => ReactNode;
  toolbarEnd?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}

interface FlatHeader {
  kind: "header";
  id: string;
  label: string;
}
interface FlatRow {
  kind: "row";
  row: MessageRowView;
}
type FlatItem = FlatHeader | FlatRow;

interface MailboxShortcutBinding {
  id: ShortcutActionId;
  shortcuts: string[];
  run: (event: KeyboardEvent) => void;
}

const READ_ONLY_SHORTCUTS = new Set<ShortcutActionId>([
  "mailbox.select",
  "mailbox.select-all",
  "mailbox.select-none",
  "mailbox.archive",
  "mailbox.star",
  "mailbox.toggle-read",
  "mailbox.mark-read",
  "mailbox.mark-unread",
  "mailbox.trash",
  "mailbox.spam",
]);

export function MailboxList({
  groups,
  mailboxPath,
  activeThreadId,
  previewOnFocus,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  readOnly = false,
  rowAction,
  toolbarEnd,
  onRefresh,
  refreshing = false,
}: MailboxListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const pendingSequenceTimerRef = useRef<number | null>(null);
  const pendingSequenceEventsRef = useRef<KeyboardEvent[]>([]);
  const navigate = useNavigate();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const activePane = useMailboxPane((state) => state.activePane);
  const setActivePane = useMailboxPane((state) => state.setActivePane);
  const setSuppressNextReaderFocus = useMailboxPane((state) => state.setSuppressNextReaderFocus);
  const setScope = useSelection((state) => state.setScope);
  const selectedIds = useSelection((state) => state.ids);
  const toggle = useSelection((state) => state.toggle);
  const selectRange = useSelection((state) => state.selectRange);
  const selectMany = useSelection((state) => state.selectMany);
  const clearSelection = useSelection((state) => state.clear);
  const lastClickedId = useSelection((state) => state.lastClickedId);
  const archive = useOptimisticMailMutation("archive");
  const spam = useOptimisticMailMutation("spam");
  const trash = useOptimisticMailMutation("trash");
  const star = useOptimisticMailMutation("star");
  const unstar = useOptimisticMailMutation("unstar");
  const read = useOptimisticMailMutation("read");
  const unread = useOptimisticMailMutation("unread");
  const density = useUiPrefs((state) => state.density);
  const keybindings = useUiPrefs((state) => state.keybindings);

  const flat = useMemo(() => flatten(groups), [groups]);
  const rows = useMemo(
    () => flat.flatMap((item) => (item.kind === "row" ? [item.row] : [])),
    [flat],
  );
  const focusedIndex = useMemo(() => {
    if (!focusedId) return rows.length > 0 ? 0 : -1;
    const index = rows.findIndex((row) => row.id === focusedId);
    return index >= 0 ? index : rows.length > 0 ? 0 : -1;
  }, [focusedId, rows]);
  const focusedRow = focusedIndex >= 0 ? rows[focusedIndex] : undefined;
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.has(row.id)),
    [rows, selectedIds],
  );

  useEffect(() => setScope(mailboxPath), [mailboxPath, setScope]);

  useEffect(() => {
    setFocusedId((current) => {
      if (rows.length === 0) return null;
      if (current && rows.some((row) => row.id === current)) return current;
      return rows[0]?.id ?? null;
    });
  }, [rows]);

  useEffect(() => {
    if (!activeThreadId) return;
    const row = rows.find((item) => item.thread_id === activeThreadId);
    if (row) setFocusedId(row.id);
  }, [activeThreadId, rows]);

  const virtualizer = useVirtualizer({
    count: flat.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      if (flat[index]?.kind === "header") return density === "compact" ? 26 : 32;
      if (density === "compact") return 32;
      if (density === "comfortable") return 68;
      return 52;
    },
    overscan: 10,
  });
  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    virtualizer.measure();
  }, [density, virtualizer]);

  useEffect(() => {
    const lastItem = virtualItems.at(-1);
    if (!lastItem || !hasMore || loadingMore || !onLoadMore) return;
    if (lastItem.index >= flat.length - 8) onLoadMore();
  }, [flat.length, hasMore, loadingMore, onLoadMore, virtualItems]);

  useEffect(() => {
    if (!focusedRow) return;
    const flatIndex = flat.findIndex(
      (item) => item.kind === "row" && item.row.id === focusedRow.id,
    );
    if (flatIndex >= 0) virtualizer.scrollToIndex(flatIndex, { align: "auto" });
  }, [flat, focusedRow, virtualizer]);

  const openRow = useCallback(
    (row: MessageRowView, pane: "mailbox" | "reader") => {
      setActivePane(pane);
      setSuppressNextReaderFocus(pane === "mailbox");
      void navigate({
        to: buildMailThreadPathFromMailboxPath(mailboxPath, row.thread_id),
      });
    },
    [mailboxPath, navigate, setActivePane, setSuppressNextReaderFocus],
  );

  useShortcutScope("mailbox", activePane === "mailbox");
  const setPendingPrefix = useKeyScope((state) => state.setPendingPrefix);

  const clearPendingSequence = useCallback(() => {
    if (pendingSequenceTimerRef.current !== null) {
      window.clearTimeout(pendingSequenceTimerRef.current);
      pendingSequenceTimerRef.current = null;
    }
    pendingSequenceEventsRef.current = [];
    setPendingPrefix(null);
  }, [setPendingPrefix]);

  const focusRowAt = useCallback(
    (index: number, align: "auto" | "start" | "end" = "auto") => {
      if (rows.length === 0) return;
      const next = Math.max(0, Math.min(rows.length - 1, index));
      const row = rows[next];
      if (!row) return;
      setFocusedId(row.id);
      const flatIndex = flat.findIndex((item) => item.kind === "row" && item.row.id === row.id);
      if (flatIndex >= 0) virtualizer.scrollToIndex(flatIndex, { align });
      if (previewOnFocus && row.thread_id !== activeThreadId) openRow(row, "mailbox");
    },
    [activeThreadId, flat, openRow, previewOnFocus, rows, virtualizer],
  );

  const moveFocus = useCallback(
    (delta: number) => {
      if (rows.length === 0) return;
      const current = focusedIndex >= 0 ? focusedIndex : 0;
      focusRowAt(current + delta);
    },
    [focusRowAt, focusedIndex, rows.length],
  );

  const dragSourceFor = useCallback(
    (row: MessageRowView): MailDragSource => {
      const dragRows = selectedIds.has(row.id) ? selectedRows : [row];
      return {
        type: "mail-row",
        messageIds: dragRows.map((item) => item.id),
        accountIds: [
          ...new Set(dragRows.flatMap((item) => (item.account_id ? [item.account_id] : []))),
        ],
        preview: { sender: row.sender, subject: row.subject },
      };
    },
    [selectedIds, selectedRows],
  );

  const focusedOrSelectedIds = useCallback((): string[] => {
    if (selectedIds.size > 0) return [...selectedIds];
    const row = rows[focusedIndex];
    return row ? [row.id] : [];
  }, [focusedIndex, rows, selectedIds]);

  const mailboxShortcuts = useMemo<MailboxShortcutBinding[]>(() => {
    const handlers: Array<{
      id: ShortcutActionId;
      run: (event: KeyboardEvent) => void;
    }> = [
      { id: "mailbox.move-next", run: () => moveFocus(1) },
      { id: "mailbox.move-previous", run: () => moveFocus(-1) },
      { id: "mailbox.go-top", run: () => focusRowAt(0, "start") },
      {
        id: "mailbox.go-bottom",
        run: () => focusRowAt(rows.length - 1, "end"),
      },
      {
        id: "mailbox.open",
        run: () => {
          const row = rows[focusedIndex];
          if (row) openRow(row, "reader");
        },
      },
      {
        id: "mailbox.select",
        run: (event) => {
          const row = rows[focusedIndex];
          if (!row) return;
          if (event.shiftKey && lastClickedId) {
            const ordered = rows.map((item) => item.id);
            const a = ordered.indexOf(lastClickedId);
            const b = ordered.indexOf(row.id);
            if (a >= 0 && b >= 0) {
              const [start, end] = a < b ? [a, b] : [b, a];
              selectRange(ordered.slice(start, end + 1));
              return;
            }
          }
          toggle(row.id);
        },
      },
      {
        id: "mailbox.select-all",
        run: () => selectMany(rows.map((row) => row.id)),
      },
      { id: "mailbox.select-none", run: () => clearSelection() },
      {
        id: "mailbox.archive",
        run: () => {
          const ids = focusedOrSelectedIds();
          if (ids.length > 0) archive.mutate(ids);
        },
      },
      {
        id: "mailbox.star",
        run: () => {
          const row = rows[focusedIndex];
          if (row) (row.starred ? unstar : star).mutate([row.id]);
        },
      },
      {
        id: "mailbox.toggle-read",
        run: () => {
          const row = rows[focusedIndex];
          if (row) (row.unread ? read : unread).mutate([row.id]);
        },
      },
      {
        id: "mailbox.mark-read",
        run: () => {
          const ids = focusedOrSelectedIds();
          if (ids.length > 0) read.mutate(ids);
        },
      },
      {
        id: "mailbox.mark-unread",
        run: () => {
          const ids = focusedOrSelectedIds();
          if (ids.length > 0) unread.mutate(ids);
        },
      },
      {
        id: "mailbox.trash",
        run: () => {
          const ids = focusedOrSelectedIds();
          if (ids.length > 0) trash.mutate(ids);
        },
      },
      {
        id: "mailbox.spam",
        run: () => {
          const ids = focusedOrSelectedIds();
          if (ids.length > 0) spam.mutate(ids);
        },
      },
      { id: "mailbox.focus-sidebar", run: () => setActivePane("sidebar") },
    ];

    return handlers
      .filter(({ id }) => !readOnly || !READ_ONLY_SHORTCUTS.has(id))
      .map(({ id, run }) => ({ id, shortcuts: getShortcutValues(id, keybindings), run }));
  }, [
    archive,
    clearSelection,
    focusRowAt,
    focusedIndex,
    focusedOrSelectedIds,
    keybindings,
    lastClickedId,
    moveFocus,
    openRow,
    read,
    readOnly,
    rows,
    selectMany,
    selectRange,
    setActivePane,
    spam,
    star,
    toggle,
    trash,
    unread,
    unstar,
  ]);

  useEffect(() => {
    function schedulePendingSequence(): void {
      if (pendingSequenceTimerRef.current !== null) {
        window.clearTimeout(pendingSequenceTimerRef.current);
      }
      pendingSequenceTimerRef.current = window.setTimeout(clearPendingSequence, 1500);
    }

    function handleResolution(
      event: KeyboardEvent,
      events: KeyboardEvent[],
      resolution: ShortcutResolution,
    ): boolean {
      if (resolution.kind === "prefix") {
        pendingSequenceEventsRef.current = events;
        setPendingPrefix(events.map((item) => item.key).join(""));
        schedulePendingSequence();
        if (events.length > 1 || event.key === "*") event.preventDefault();
        return true;
      }
      if (resolution.kind !== "match") return false;
      event.preventDefault();
      clearPendingSequence();
      resolution.binding.run(event);
      return true;
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (activePane !== "mailbox") return;
      if (event.defaultPrevented) {
        clearPendingSequence();
        return;
      }
      if (isShortcutSuppressed(event)) {
        clearPendingSequence();
        return;
      }
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("button, [role=checkbox], [data-mailbox-control]")
      ) {
        clearPendingSequence();
        return;
      }

      const pending = pendingSequenceEventsRef.current;
      const events = [...pending, event];
      if (handleResolution(event, events, resolveMailboxShortcut(events, mailboxShortcuts))) return;

      if (pending.length > 0) {
        clearPendingSequence();
        if (handleResolution(event, [event], resolveMailboxShortcut([event], mailboxShortcuts))) {
          return;
        }
      }

      if (event.key === "Escape") {
        clearPendingSequence();
        event.preventDefault();
        if (selectedIds.size > 0) {
          clearSelection();
        } else if (activeThreadId) {
          void navigate({ to: mailboxPath });
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearPendingSequence();
    };
  }, [
    activePane,
    activeThreadId,
    clearPendingSequence,
    clearSelection,
    mailboxPath,
    mailboxShortcuts,
    navigate,
    selectedIds,
    setPendingPrefix,
  ]);

  function toggleRow(row: MessageRowView, shift: boolean) {
    if (shift && lastClickedId) {
      const ordered = rows.map((item) => item.id);
      const a = ordered.indexOf(lastClickedId);
      const b = ordered.indexOf(row.id);
      if (a >= 0 && b >= 0) {
        const [start, end] = a < b ? [a, b] : [b, a];
        selectRange(ordered.slice(start, end + 1));
        return;
      }
    }
    toggle(row.id);
  }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {readOnly ? null : (
        <BulkActionBar
          rows={rows}
          onRefresh={onRefresh}
          refreshing={refreshing}
          trailing={toolbarEnd}
        />
      )}
      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No mail here"
          description="No messages match this view or filter."
        />
      ) : (
        <div
          ref={parentRef}
          role="region"
          aria-label="Mailbox messages"
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
          data-active-pane={activePane === "mailbox" ? "true" : undefined}
          data-testid="mailbox-list"
          onMouseDown={() => setActivePane("mailbox")}
        >
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
            {virtualItems.map((virtualItem) => {
              const item = flat[virtualItem.index];
              if (!item) return null;
              return (
                <div
                  key={item.kind === "header" ? item.id : item.row.id}
                  data-index={virtualItem.index}
                  data-mailbox-virtual-row={item.kind === "row" ? "true" : undefined}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualItem.start}px)` }}
                >
                  {item.kind === "header" ? (
                    <div className="mailbox-group-header sticky top-0 z-[1] flex h-8 items-center border-b border-border bg-background/95 px-3 font-mono text-2xs uppercase tracking-wide text-muted-foreground backdrop-blur">
                      {item.label}
                    </div>
                  ) : (
                    <MailboxRow
                      row={item.row}
                      selected={!readOnly && selectedIds.has(item.row.id)}
                      focused={focusedRow?.id === item.row.id}
                      onToggleSelection={(shift) => toggleRow(item.row, shift)}
                      onFocusPane={() => setActivePane("mailbox")}
                      onFocusRow={() => setFocusedId(item.row.id)}
                      onOpen={() => openRow(item.row, "mailbox")}
                      onOpenWithKeyboard={() => openRow(item.row, "reader")}
                      dragSource={!readOnly ? dragSourceFor(item.row) : undefined}
                      readOnly={readOnly}
                      trailingAction={rowAction?.(item.row)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

type ShortcutResolution =
  | { kind: "none" }
  | { kind: "prefix" }
  | { kind: "match"; binding: MailboxShortcutBinding };

function resolveMailboxShortcut(
  events: readonly KeyboardEvent[],
  bindings: readonly MailboxShortcutBinding[],
): ShortcutResolution {
  const match = bindings.find((binding) =>
    binding.shortcuts.some((shortcut) => matchesShortcutSequence(events, shortcut)),
  );
  const hasLongerPrefix = bindings.some((binding) =>
    binding.shortcuts.some((shortcut) => isShortcutSequencePrefix(events, shortcut)),
  );
  if (match && !hasLongerPrefix) return { kind: "match", binding: match };
  if (hasLongerPrefix) return { kind: "prefix" };
  return { kind: "none" };
}

function flatten(groups: MessageGroupView[]): FlatItem[] {
  const items: FlatItem[] = [];
  for (const group of groups) {
    items.push({ kind: "header", id: group.id, label: group.label });
    for (const row of group.rows) items.push({ kind: "row", row });
  }
  return items;
}
