import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { find as findLinks } from "linkifyjs";
import {
  Archive,
  ArrowLeft,
  Ban,
  Check,
  Clock,
  FileText,
  Forward,
  Mail,
  MailOpen,
  Maximize2,
  Minimize2,
  MoreVertical,
  Paperclip,
  RefreshCw,
  Reply,
  ReplyAll,
  Star,
  Tag,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { hasNonShiftModifier } from "@/lib/keybindings";

import {
  fetchSenderProfile,
  fetchThread,
  getThreadBriefing,
  listCommitments,
  modifyLabels,
  resolveCommitment,
  shellKey,
} from "@/features/mailbox/api";
import {
  buildMailThreadPathFromMailboxPath,
  mailboxPathFromLocation,
  parseMailLocation,
} from "@/features/mailbox/location";
import { SnoozeDialog } from "@/features/mailbox/SnoozeDialog";
import { AttachmentActions } from "@/features/thread/AttachmentActions";
import { InviteCard } from "@/features/thread/InviteCard";
import { MailboxRoute } from "@/features/mailbox/MailboxRoute";
import { MessageBody } from "@/features/thread/MessageBody";
import type {
  MailboxResponse,
  MessageBodyView,
  MessageLabelView,
  MessageRowView,
  ShellResponse,
  ThreadResponse,
} from "@/features/mailbox/types";
import { useOptimisticMailMutation } from "@/features/mailbox/useOptimisticMailMutation";
import { useShellQuery } from "@/features/mailbox/useMailboxQuery";
import { replyIntent, useComposeUi } from "@/features/compose/composeUiStore";
import { useShortcutScope } from "@/hooks/useShortcutScope";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useMailboxPane } from "@/state/mailboxPaneStore";
import { useModals } from "@/state/modalStore";
import {
  DEFAULT_THREAD_SPLIT_RATIO,
  THREAD_SPLIT_RATIO_MAX,
  THREAD_SPLIT_RATIO_MIN,
  useUiPrefs,
} from "@/state/uiPrefsStore";

interface LabelChange {
  add: string[];
  remove: string[];
}

interface ThreadCommitmentView {
  id: string;
  direction: string;
  whoOwes: string;
  what: string;
  byWhen?: string | null;
}

const THREAD_MAILBOX_MIN_WIDTH = 320;
const THREAD_SPLIT_KEYBOARD_STEP = 0.05;

export function ThreadRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const readerLayout = useUiPrefs((state) => state.readerLayout);
  const threadSplitRatio = useUiPrefs((state) => state.threadSplitRatio);
  const setThreadSplitRatio = useUiPrefs((state) => state.setThreadSplitRatio);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const location = parseMailLocation(pathname);
  const threadId = location?.threadId ?? "";
  const mailboxPath = location ? mailboxPathFromLocation(location) : "/";
  const readerFull = readerLayout === "full";
  const splitStyle: CSSProperties | undefined = readerFull
    ? undefined
    : {
        width: `${threadSplitRatio * 100}%`,
        minWidth: `${THREAD_MAILBOX_MIN_WIDTH}px`,
      };
  return (
    <div
      ref={splitContainerRef}
      className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
      data-thread-split-ratio={readerFull ? undefined : threadSplitRatio}
    >
      <div
        className={cn("hidden min-w-0 shrink-0", readerFull ? "lg:hidden" : "lg:flex")}
        style={splitStyle}
      >
        <MailboxRoute />
      </div>
      {!readerFull ? (
        <ThreadSplitResizeHandle
          containerRef={splitContainerRef}
          ratio={threadSplitRatio}
          onChange={setThreadSplitRatio}
          onReset={() => setThreadSplitRatio(DEFAULT_THREAD_SPLIT_RATIO)}
        />
      ) : null}
      <ThreadReader threadId={threadId} mailboxPath={mailboxPath} />
    </div>
  );
}

interface ThreadSplitResizeHandleProps {
  containerRef: RefObject<HTMLDivElement | null>;
  ratio: number;
  onChange: (ratio: number) => void;
  onReset: () => void;
}

function ThreadSplitResizeHandle({
  containerRef,
  ratio,
  onChange,
  onReset,
}: ThreadSplitResizeHandleProps) {
  const drag = useRef<{ pointerId: number; startX: number; startRatio: number } | null>(null);

  function endPointerResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (
      typeof event.currentTarget.hasPointerCapture === "function" &&
      event.currentTarget.hasPointerCapture(event.pointerId) &&
      typeof event.currentTarget.releasePointerCapture === "function"
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drag.current = null;
  }

  return (
    <button
      type="button"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize mailbox pane"
      aria-valuemin={THREAD_SPLIT_RATIO_MIN * 100}
      aria-valuemax={THREAD_SPLIT_RATIO_MAX * 100}
      aria-valuenow={ratio * 100}
      aria-valuetext={`${Math.round(ratio * 100)}% mailbox width`}
      tabIndex={0}
      data-testid="thread-split-resize-handle"
      className="hidden h-full w-2 cursor-ew-resize touch-none items-center justify-center border-0 bg-transparent p-0 outline-none transition-colors hover:bg-border focus-visible:bg-primary/30 lg:flex"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startRatio: ratio,
        };
        if (typeof event.currentTarget.setPointerCapture === "function") {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        const width = containerRef.current?.getBoundingClientRect().width ?? 0;
        if (!current || current.pointerId !== event.pointerId || width <= 0) return;
        event.preventDefault();
        onChange(current.startRatio + (event.clientX - current.startX) / width);
      }}
      onPointerUp={endPointerResize}
      onPointerCancel={endPointerResize}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onChange(ratio - THREAD_SPLIT_KEYBOARD_STEP);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onChange(ratio + THREAD_SPLIT_KEYBOARD_STEP);
        } else if (event.key === "Home") {
          event.preventDefault();
          onChange(THREAD_SPLIT_RATIO_MIN);
        } else if (event.key === "End") {
          event.preventDefault();
          onChange(THREAD_SPLIT_RATIO_MAX);
        }
      }}
      onDoubleClick={onReset}
    >
      <span className="h-full w-px bg-border" aria-hidden="true" />
    </button>
  );
}

function ThreadReader({ threadId, mailboxPath }: { threadId: string; mailboxPath: string }) {
  const query = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => fetchThread(threadId),
    enabled: Boolean(threadId),
  });

  if (query.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Loading thread…
      </div>
    );
  }

  if (query.isError) {
    return (
      <EmptyState
        role="alert"
        icon={RefreshCw}
        title="Thread unavailable"
        description={query.error.message}
        action={<Button onClick={() => query.refetch()}>Retry</Button>}
      />
    );
  }

  if (!query.data) return null;
  return <ThreadContent data={query.data} mailboxPath={mailboxPath} />;
}

function ThreadContent({ data, mailboxPath }: { data: ThreadResponse; mailboxPath: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const activePane = useMailboxPane((state) => state.activePane);
  const setActivePane = useMailboxPane((state) => state.setActivePane);
  const setSuppressNextReaderFocus = useMailboxPane((state) => state.setSuppressNextReaderFocus);
  const emailHtmlTheme = useUiPrefs((state) => state.emailHtmlTheme);
  const readerLayout = useUiPrefs((state) => state.readerLayout);
  const setReaderLayout = useUiPrefs((state) => state.setReaderLayout);
  const shell = useShellQuery();
  const archive = useOptimisticMailMutation("archive");
  const spam = useOptimisticMailMutation("spam");
  const trash = useOptimisticMailMutation("trash");
  const star = useOptimisticMailMutation("star");
  const unstar = useOptimisticMailMutation("unstar");
  const markUnread = useOptimisticMailMutation("unread");
  const markReadAction = useOptimisticMailMutation("read");
  const markRead = useOptimisticMailMutation("read", { silentSuccess: true });
  const markReadRef = useRef(markRead.mutate);
  const autoReadStateRef = useRef({ pending: new Set<string>(), completed: new Set<string>() });
  markReadRef.current = markRead.mutate;
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const openRail = useModals((state) => state.openRightRail);

  useEffect(() => {
    const paneState = useMailboxPane.getState();
    if (paneState.suppressNextReaderFocus) {
      paneState.setSuppressNextReaderFocus(false);
      return;
    }
    setActivePane("reader");
  }, [data.thread.id, setActivePane]);

  const senderProfile = useMutation({
    mutationFn: (email: string) => fetchSenderProfile({ accountId: data.thread.account_id, email }),
    onSuccess: (result) => openRail("sender-profile", result),
    onError: (error) => toast.error("Sender profile failed", { description: error.message }),
  });
  const briefing = useMutation({
    mutationFn: (refresh?: boolean) =>
      getThreadBriefing({ threadId: data.thread.id, refresh: refresh ?? false }),
    onSuccess: (result) => openRail("thread-briefing", result.briefing),
    onError: (error) => toast.error("Briefing failed", { description: error.message }),
  });
  const bodiesByMessage = useMemo(
    () => new Map(data.bodies.map((body) => [body.message_id, body])),
    [data.bodies],
  );
  const allMessageIds = useMemo(() => data.messages.map((message) => message.id), [data.messages]);
  const attachments = data.bodies.flatMap((body) => body.attachments ?? []);
  const primaryMessage = data.messages[0];
  const anyUnread = data.messages.some((message) => message.unread);
  const anyStarred = data.messages.some((message) => message.starred);
  const recipientCount =
    (primaryMessage?.to?.length ?? 0) +
    (primaryMessage?.cc?.length ?? 0) +
    (primaryMessage?.bcc?.length ?? 0);
  const canReplyAll = recipientCount > 1 || data.thread.participants.length > 2;
  const threadLabels = useMemo(() => uniqueLabels(data.messages), [data.messages]);
  const labelOptions = useMemo(
    () => labelOptionsFromShell(shell.data, threadLabels),
    [shell.data, threadLabels],
  );
  const primarySenderEmail = extractEmail(primaryMessage?.sender_detail ?? primaryMessage?.sender);
  const commitments = useQuery({
    queryKey: ["commitments", data.thread.account_id, primarySenderEmail],
    queryFn: () =>
      listCommitments({
        accountId: data.thread.account_id,
        email: primarySenderEmail ?? undefined,
        status: "open",
      }),
    enabled: Boolean(primarySenderEmail),
    staleTime: 30_000,
  });
  const openCommitments = useMemo(
    () => extractThreadCommitments(commitments.data),
    [commitments.data],
  );
  const resolveThreadCommitment = useMutation({
    mutationFn: resolveCommitment,
    onSuccess: () => {
      toast.success("Commitment resolved");
      void queryClient.invalidateQueries({
        queryKey: ["commitments", data.thread.account_id, primarySenderEmail],
      });
    },
    onError: (error) => toast.error("Resolve failed", { description: error.message }),
  });
  const readerFull = readerLayout === "full";
  const toggleReaderLayout = useCallback(() => {
    setReaderLayout(readerFull ? "split" : "full");
  }, [readerFull, setReaderLayout]);
  useShortcutScope("thread", activePane === "reader");
  // Sibling threads come from the already-cached mailbox list (the split
  // pane keeps that query warm), so [ / ] can archive-and-advance. Read the
  // cache lazily — the list containing this thread is the active lens.
  const siblingThreadIds = useCallback((): string[] => {
    const cached = queryClient.getQueriesData<{ pages?: MailboxResponse[] }>({
      queryKey: ["mailbox"],
    });
    for (const [, value] of cached) {
      const pages = value?.pages ?? [];
      const ids = [
        ...new Set(
          pages.flatMap((page) =>
            page.mailbox.groups.flatMap((group) => group.rows.map((row) => row.thread_id)),
          ),
        ),
      ];
      if (ids.includes(data.thread.id)) return ids;
    }
    return [];
  }, [data.thread.id, queryClient]);
  const archiveAndStep = useCallback(
    (delta: 1 | -1) => {
      if (allMessageIds.length === 0) return;
      const siblings = siblingThreadIds();
      const index = siblings.indexOf(data.thread.id);
      const nextId = index >= 0 ? siblings[index + delta] : undefined;
      archive.mutate(allMessageIds);
      if (nextId) {
        void navigate({ to: buildMailThreadPathFromMailboxPath(mailboxPath, nextId) });
      } else {
        void navigate({ to: mailboxPath });
      }
    },
    [allMessageIds, archive, data.thread.id, mailboxPath, navigate, siblingThreadIds],
  );
  const labelMutation = useMutation({
    mutationFn: ({ add, remove }: LabelChange) => modifyLabels(allMessageIds, add, remove),
    onSuccess: (response) => {
      const count = response.result?.succeeded ?? allMessageIds.length;
      toast.success(`Updated labels for ${count} ${count === 1 ? "message" : "messages"}`);
      setLabelDialogOpen(false);
    },
    onError: (error) => toast.error("Label update failed", { description: error.message }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["mailbox"] });
      void queryClient.invalidateQueries({ queryKey: ["thread"] });
      void queryClient.invalidateQueries({ queryKey: shellKey });
    },
  });

  const compose = useCallback(
    (composeMode: "single" | "all" | "forward") => {
      if (!primaryMessage) return;
      // Reply opens inline at the bottom of the thread; the host keeps the
      // session alive if the user pops it out or goes fullscreen.
      useComposeUi.getState().openCompose(replyIntent(primaryMessage.id, composeMode), "inline");
    },
    [primaryMessage],
  );

  const toggleStar = useCallback(() => {
    if (!primaryMessage) return;
    (anyStarred ? unstar : star).mutate([primaryMessage.id]);
  }, [anyStarred, primaryMessage, star, unstar]);

  const toggleRead = useCallback(() => {
    if (allMessageIds.length === 0) return;
    (anyUnread ? markReadAction : markUnread).mutate(allMessageIds);
  }, [allMessageIds, anyUnread, markReadAction, markUnread]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (activePane !== "reader") return;
      if (hasNonShiftModifier(event)) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.closest("input, textarea, select, [contenteditable=true]")) return;
      }
      if (labelDialogOpen || snoozeOpen) return;
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        scrollRef.current?.scrollBy({ top: 72, behavior: "smooth" });
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        scrollRef.current?.scrollBy({ top: -72, behavior: "smooth" });
      } else if (event.key === "h" || event.key === "ArrowLeft") {
        event.preventDefault();
        setSuppressNextReaderFocus(true);
        setActivePane("mailbox");
      } else if (event.key === "R") {
        event.preventDefault();
        markReadAction.mutate(allMessageIds);
      } else if (event.key === "U") {
        event.preventDefault();
        markUnread.mutate(allMessageIds);
      } else if (event.key === "u" || event.key === "Escape") {
        event.preventDefault();
        void navigate({ to: mailboxPath });
      } else if (event.key === "e") {
        event.preventDefault();
        archive.mutate(allMessageIds);
        void navigate({ to: mailboxPath });
      } else if (event.key === "]") {
        event.preventDefault();
        archiveAndStep(1);
      } else if (event.key === "[") {
        event.preventDefault();
        archiveAndStep(-1);
      } else if (event.key === "s") {
        event.preventDefault();
        toggleStar();
      } else if (event.key === "m") {
        event.preventDefault();
        toggleRead();
      } else if (event.key === "L") {
        event.preventDefault();
        openRail("thread-context", data.right_rail);
      } else if (event.key === "A") {
        event.preventDefault();
        if (attachments.length > 0) openRail("attachments", attachments);
      } else if (event.key === "p") {
        event.preventDefault();
        if (primarySenderEmail) senderProfile.mutate(primarySenderEmail);
      } else if (event.key === "F") {
        event.preventDefault();
        toggleReaderLayout();
      } else if (event.key === "l") {
        event.preventDefault();
        setLabelDialogOpen(true);
      } else if (event.key === "Z") {
        // Shift+Z snoozes (matches the TUI); lowercase z stays free for the
        // global undo binding.
        event.preventDefault();
        setSnoozeOpen(true);
      } else if (event.key === "r") {
        event.preventDefault();
        compose("single");
      } else if (event.key === "a") {
        event.preventDefault();
        if (canReplyAll) compose("all");
      } else if (event.key === "f") {
        event.preventDefault();
        compose("forward");
      } else if (event.key === "!") {
        event.preventDefault();
        spam.mutate(allMessageIds);
        void navigate({ to: mailboxPath });
      } else if (["#", "Delete", "Backspace"].includes(event.key)) {
        event.preventDefault();
        trash.mutate(allMessageIds);
        void navigate({ to: mailboxPath });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activePane,
    allMessageIds,
    archive,
    attachments,
    canReplyAll,
    data.right_rail,
    mailboxPath,
    navigate,
    labelDialogOpen,
    markReadAction,
    markUnread,
    openRail,
    primarySenderEmail,
    setActivePane,
    setSuppressNextReaderFocus,
    senderProfile,
    snoozeOpen,
    spam,
    trash,
    toggleRead,
    toggleStar,
    toggleReaderLayout,
    compose,
    archiveAndStep,
  ]);

  useEffect(() => {
    const autoReadState = autoReadStateRef.current;
    const unreadIds = data.messages.flatMap((message) =>
      message.unread &&
      !autoReadState.pending.has(message.id) &&
      !autoReadState.completed.has(message.id)
        ? [message.id]
        : [],
    );
    if (unreadIds.length === 0) return;
    for (const id of unreadIds) autoReadState.pending.add(id);
    markReadRef.current(unreadIds, {
      onSuccess: () => {
        for (const id of unreadIds) {
          autoReadState.pending.delete(id);
          autoReadState.completed.add(id);
        }
      },
      onError: () => {
        for (const id of unreadIds) autoReadState.pending.delete(id);
      },
    });
  }, [data.messages]);

  const overflowActions = useMemo<ReaderOverflowAction[]>(
    () => [
      {
        label: anyStarred ? "Unstar" : "Star",
        shortcut: "s",
        icon: <Star className={cn("size-3", anyStarred && "fill-current text-star")} />,
        onSelect: toggleStar,
      },
      {
        label: "Archive",
        shortcut: "e",
        icon: <Archive className="size-3" />,
        onSelect: () => archive.mutate(allMessageIds),
      },
      {
        label: "Spam",
        shortcut: "!",
        icon: <Ban className="size-3" />,
        onSelect: () => spam.mutate(allMessageIds),
      },
      {
        label: "Trash",
        shortcut: "# / Del",
        icon: <Trash2 className="size-3" />,
        destructive: true,
        onSelect: () => trash.mutate(allMessageIds),
      },
      {
        label: anyUnread ? "Mark read" : "Mark unread",
        shortcut: "m",
        icon: anyUnread ? <MailOpen className="size-3" /> : <Mail className="size-3" />,
        onSelect: toggleRead,
      },
      {
        label: "Labels",
        shortcut: "l",
        icon: <Tag className="size-3" />,
        onSelect: () => setLabelDialogOpen(true),
      },
      {
        label: "Snooze",
        shortcut: "Z",
        icon: <Clock className="size-3" />,
        onSelect: () => setSnoozeOpen(true),
      },
      {
        label: readerFull ? "Split reader" : "Full reader",
        shortcut: "F",
        icon: readerFull ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />,
        onSelect: toggleReaderLayout,
      },
      {
        label: "Context",
        shortcut: "L",
        icon: <UserRound className="size-3" />,
        onSelect: () => openRail("thread-context", data.right_rail),
      },
      {
        label: "Sender",
        shortcut: "p",
        icon: <UserRound className="size-3" />,
        disabled: !primarySenderEmail || senderProfile.isPending,
        onSelect: () => primarySenderEmail && senderProfile.mutate(primarySenderEmail),
      },
      {
        label: "Briefing",
        icon: <FileText className="size-3" />,
        disabled: briefing.isPending,
        onSelect: () => briefing.mutate(false),
      },
      ...(attachments.length > 0
        ? [
            {
              label: `Attachments (${attachments.length})`,
              shortcut: "A",
              icon: <Paperclip className="size-3" />,
              onSelect: () => openRail("attachments", attachments),
            },
          ]
        : []),
    ],
    [
      allMessageIds,
      anyStarred,
      anyUnread,
      archive,
      attachments,
      briefing,
      data.right_rail,
      openRail,
      primarySenderEmail,
      readerFull,
      senderProfile,
      spam,
      toggleRead,
      toggleReaderLayout,
      toggleStar,
      trash,
    ],
  );

  return (
    <article
      aria-label="Thread reader"
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-background"
      data-active-pane={activePane === "reader" ? "true" : undefined}
      data-reader-layout={readerLayout}
      onMouseDown={() => {
        setSuppressNextReaderFocus(false);
        setActivePane("reader");
      }}
    >
      <header className="border-b border-border px-3 py-1.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8 shrink-0"
            aria-label="Back to mailbox"
            title="Back to mailbox"
            onClick={() => void navigate({ to: mailboxPath })}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="min-w-0 truncate text-base font-semibold tracking-tight">
                  {data.thread.subject || "(no subject)"}
                </h1>
                {threadLabels.map((label) => (
                  <LabelBadge key={label.id} label={label} />
                ))}
              </div>
              <div className="truncate text-2xs text-muted-foreground">
                {data.thread.message_count} messages · {data.thread.unread_count} unread
                {data.thread.participants.some((participant) => participant.name?.trim())
                  ? " · "
                  : ""}
                {data.thread.participants
                  .flatMap((participant) =>
                    participant.name?.trim() ? [participant.name.trim()] : [],
                  )
                  .slice(0, 4)
                  .join(", ")}
              </div>
            </div>
          </div>
          <div
            className="flex shrink-0 items-center gap-0.5"
            role="toolbar"
            aria-label="Message actions"
          >
            <ReaderActionButton
              icon={Reply}
              label="Reply"
              shortcut="r"
              onClick={() => compose("single")}
            />
            {canReplyAll ? (
              <ReaderActionButton
                icon={ReplyAll}
                label="Reply all"
                shortcut="a"
                onClick={() => compose("all")}
              />
            ) : null}
            <ReaderActionButton
              icon={Forward}
              label="Forward"
              shortcut="f"
              onClick={() => compose("forward")}
            />
          </div>
          <ReaderActionMenu actions={overflowActions} />
        </div>
      </header>

      <SnoozeDialog
        open={snoozeOpen}
        messageIds={allMessageIds}
        onOpenChange={setSnoozeOpen}
        onSnoozed={() => void navigate({ to: mailboxPath })}
      />
      <ThreadLabelDialog
        open={labelDialogOpen}
        labels={labelOptions}
        currentLabels={threadLabels}
        pending={labelMutation.isPending}
        onOpenChange={setLabelDialogOpen}
        onSubmit={(change) => {
          if (allMessageIds.length === 0) return;
          labelMutation.mutate(change);
        }}
      />

      <div
        ref={scrollRef}
        data-testid="thread-scroll"
        className="flex min-h-0 flex-1 flex-col overflow-auto px-4 py-3 sm:px-6 lg:px-8"
      >
        <div className="flex w-full min-w-0 flex-col">
          {openCommitments.length > 0 ? (
            <ThreadCommitmentChips
              commitments={openCommitments}
              onResolve={(id) => resolveThreadCommitment.mutate(id)}
              resolving={resolveThreadCommitment.isPending}
            />
          ) : null}
          {data.messages.map((message) => (
            <ThreadMessage
              key={message.id}
              message={message}
              body={bodiesByMessage.get(message.id)}
              emailHtmlTheme={emailHtmlTheme}
              threadId={data.thread.id}
            />
          ))}
          {/* ComposeHost portals the inline reply composer here. */}
          <div id="inline-composer-slot" className="mt-3 empty:hidden" />
        </div>
      </div>
    </article>
  );
}

function ThreadCommitmentChips({
  commitments,
  onResolve,
  resolving,
}: {
  commitments: ThreadCommitmentView[];
  onResolve: (commitmentId: string) => void;
  resolving: boolean;
}) {
  return (
    <section
      aria-label="Open commitments"
      className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3"
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
        <FileText className="size-3.5 text-amber-500" />
        Open commitments
      </div>
      <div className="flex flex-wrap gap-2">
        {commitments.slice(0, 4).map((commitment) => (
          <div
            key={commitment.id}
            className="flex max-w-full items-center gap-1.5 rounded-md border border-amber-500/40 bg-background/70 py-1 pl-2 pr-1 text-2xs"
            title={commitment.what}
          >
            <span className="font-medium">{commitment.whoOwes}</span>
            <span className="text-muted-foreground">{commitment.direction}</span>
            <span className="max-w-[280px] truncate">{commitment.what}</span>
            {commitment.byWhen ? (
              <span className="text-muted-foreground">due {shortDate(commitment.byWhen)}</span>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0"
              aria-label={`Resolve commitment: ${commitment.what}`}
              disabled={resolving}
              onClick={() => onResolve(commitment.id)}
            >
              <Check className="size-3" />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function ThreadLabelDialog({
  open,
  labels,
  currentLabels,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  labels: MessageLabelView[];
  currentLabels: MessageLabelView[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (change: LabelChange) => void;
}) {
  const currentLabelIds = useMemo(
    () => currentLabels.filter(isAssignableLabel).map((label) => label.id),
    [currentLabels],
  );
  const currentLabelIdSet = useMemo(() => new Set(currentLabelIds), [currentLabelIds]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (open) setSelectedLabelIds(new Set(currentLabelIds));
  }, [open, currentLabelIds]);

  const hasChanges = labels.some(
    (label) => selectedLabelIds.has(label.id) !== currentLabelIdSet.has(label.id),
  );

  function toggleLabel(labelId: string, checked: boolean) {
    setSelectedLabelIds((previous) => {
      const next = new Set(previous);
      if (checked) {
        next.add(labelId);
      } else {
        next.delete(labelId);
      }
      return next;
    });
  }

  function submit() {
    const add = labels
      .filter((label) => selectedLabelIds.has(label.id) && !currentLabelIdSet.has(label.id))
      .map((label) => label.name);
    const remove = labels
      .filter((label) => !selectedLabelIds.has(label.id) && currentLabelIdSet.has(label.id))
      .map((label) => label.name);
    if (add.length === 0 && remove.length === 0) return;
    onSubmit({ add, remove });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit labels</DialogTitle>
          <DialogDescription>
            Check labels to add them to this thread. Uncheck labels to remove them.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-auto rounded-md border border-border bg-card p-1">
          {labels.length === 0 ? (
            <div className="px-3 py-6 text-sm text-muted-foreground">No labels available.</div>
          ) : (
            labels.map((label) => (
              <label
                key={label.id}
                className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={selectedLabelIds.has(label.id)}
                  onCheckedChange={(checked) => toggleLabel(label.id, checked === true)}
                />
                <span className="min-w-0 flex-1 truncate">{label.name}</span>
              </label>
            ))
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={pending || !hasChanges || labels.length === 0}
          >
            {pending ? "Applying..." : "Apply label changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ReaderOverflowAction {
  label: string;
  shortcut?: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

function ReaderActionMenu({ actions }: { actions: ReaderOverflowAction[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="size-11 shrink-0 rounded-md border-border/90 bg-muted/60 shadow-sm hover:border-primary/60 hover:bg-primary/15 sm:size-10"
          aria-label="More message actions"
          title="More message actions"
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            disabled={action.disabled}
            className={cn(action.destructive && "text-destructive focus:text-destructive")}
            onSelect={action.onSelect}
          >
            {action.icon}
            <span>{action.label}</span>
            {action.shortcut ? (
              <DropdownMenuShortcut>{action.shortcut}</DropdownMenuShortcut>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ReaderActionButton({
  icon: Icon,
  label,
  shortcut,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  shortcut: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-lg"
      className="size-8 rounded-md border-transparent bg-transparent shadow-none hover:border-border hover:bg-muted"
      aria-label={label}
      title={`${label} (${shortcut})`}
      onClick={onClick}
    >
      <Icon className="size-4" />
    </Button>
  );
}

function ThreadMessage({
  message,
  body,
  emailHtmlTheme,
  threadId,
}: {
  message: MessageRowView;
  body?: MessageBodyView;
  emailHtmlTheme: "dark" | "original";
  threadId: string;
}) {
  const plain = body?.reader_text || body?.text_plain || message.snippet;
  const rawHtml = body?.text_html;
  const html = rawHtml?.trim() ? rawHtml : null;
  const attachments = body?.attachments ?? [];
  const calendar = body?.metadata?.calendar;
  return (
    <section
      className={cn(
        "min-w-0 border-b border-border bg-background",
        message.unread && "border-l-2 border-l-primary pl-4",
      )}
      data-testid="thread-message"
    >
      <div className="flex min-w-0 items-start justify-between gap-2 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="break-words text-base font-medium">{message.sender}</div>
            {message.labels?.map((label) => (
              <LabelBadge key={label.id} label={label} />
            ))}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            to {formatAddressList(message.to)}
            {message.cc && message.cc.length > 0 ? ` · cc ${formatAddressList(message.cc)}` : null}
          </div>
        </div>
        <time
          className="max-w-[42%] shrink-0 truncate text-right font-mono text-xs text-muted-foreground"
          dateTime={message.date}
          title={message.date_full}
        >
          {message.date_label}
          {message.date_relative ? (
            <span className="ml-1 text-muted-foreground/80">({message.date_relative})</span>
          ) : null}
        </time>
      </div>
      {calendar && <InviteCard messageId={message.id} threadId={threadId} metadata={calendar} />}
      <div className="pb-6 text-[15px] leading-7">
        {html ? (
          <MessageBody key={message.id} html={html} theme={emailHtmlTheme} />
        ) : (
          <LinkifiedPre text={plain || "No readable body."} />
        )}
      </div>
      {attachments.length > 0 ? (
        <div className="grid gap-2 border-t border-border py-4 sm:grid-cols-2">
          {attachments.map((attachment) => (
            <AttachmentActions
              key={attachment.id ?? attachment.filename}
              attachment={attachment}
              messageId={body?.message_id}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function LinkifiedPre({ text }: { text: string }) {
  const links = useMemo(() => findLinks(text, { defaultProtocol: "https" }), [text]);
  if (links.length === 0) {
    return (
      <pre className="w-full whitespace-pre-wrap break-words font-sans text-[15px] leading-7 text-foreground">
        {text}
      </pre>
    );
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  links.forEach((link) => {
    if (link.start > cursor) nodes.push(text.slice(cursor, link.start));
    nodes.push(
      <a
        key={`${link.href}-${link.start}-${link.end}`}
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:text-primary/80"
      >
        {text.slice(link.start, link.end)}
      </a>,
    );
    cursor = link.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));

  return (
    <pre className="w-full whitespace-pre-wrap break-words font-sans text-[15px] leading-7 text-foreground">
      {nodes}
    </pre>
  );
}

function formatAddressList(addresses?: { name?: string | null; email: string }[]): string {
  if (!addresses || addresses.length === 0) return "undisclosed recipients";
  return addresses.map(formatAddress).join(", ");
}

function formatAddress(address: { name?: string | null; email: string }): string {
  const name = address.name?.trim();
  return name ? `${name} <${address.email}>` : address.email;
}

function extractThreadCommitments(payload: unknown): ThreadCommitmentView[] {
  const commitments =
    isRecord(payload) && Array.isArray(payload.commitments) ? payload.commitments : [];
  return commitments.flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = typeof item.id === "string" ? item.id : "";
    const what = typeof item.what === "string" ? item.what.trim() : "";
    const whoOwes = typeof item.who_owes === "string" ? item.who_owes.trim() : "";
    const direction = typeof item.direction === "string" ? item.direction : "";
    if (!id || !what || !whoOwes || !direction) return [];
    return [
      {
        id,
        what,
        whoOwes,
        direction,
        byWhen: typeof item.by_when === "string" ? item.by_when : null,
      },
    ];
  });
}

function shortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function uniqueLabels(messages: MessageRowView[]) {
  const labels = new Map<string, NonNullable<MessageRowView["labels"]>[number]>();
  for (const message of messages) {
    for (const label of message.labels ?? []) {
      labels.set(label.id, label);
    }
  }
  return [...labels.values()];
}

function labelOptionsFromShell(
  shell: ShellResponse | undefined,
  currentLabels: MessageLabelView[],
): MessageLabelView[] {
  const labels = new Map<string, MessageLabelView>();
  for (const section of shell?.sidebar?.sections ?? []) {
    if (section.id !== "labels") continue;
    for (const item of section.items) {
      const labelId = item.lens?.kind === "label" ? item.lens.labelId : undefined;
      if (!labelId) continue;
      labels.set(labelId, { id: labelId, name: item.label, kind: "user", color: null });
    }
  }
  for (const label of currentLabels) {
    if (isAssignableLabel(label)) labels.set(label.id, label);
  }
  return [...labels.values()];
}

function isAssignableLabel(label: MessageLabelView): boolean {
  return label.kind !== "system";
}

function LabelBadge({ label }: { label: MessageLabelView }) {
  const style = labelBadgeStyle(labelDisplayColor(label));
  return (
    <Badge variant={style ? "outline" : "secondary"} style={style} title={label.name}>
      {style ? (
        <span className="size-1.5 rounded-full" style={{ backgroundColor: style.color }} />
      ) : null}
      {label.name}
    </Badge>
  );
}

function labelDisplayColor(label: MessageLabelView): string | null {
  return normalizeHexColor(label.color) ?? fallbackLabelColor(label.name);
}

function labelBadgeStyle(color?: string | null): CSSProperties | undefined {
  const hex = normalizeHexColor(color);
  if (!hex) return undefined;
  return {
    backgroundColor: hexToRgba(hex, 0.16),
    borderColor: hexToRgba(hex, 0.65),
    color: hex,
  };
}

function normalizeHexColor(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const short = trimmed.match(/^#([0-9a-f]{3})$/i);
  if (short) {
    return `#${short[1]!
      .split("")
      .map((part) => part + part)
      .join("")}`;
  }
  const long = trimmed.match(/^#([0-9a-f]{6})$/i);
  return long ? `#${long[1]}` : null;
}

function fallbackLabelColor(name: string): string {
  switch (name.toUpperCase()) {
    case "INBOX":
      return "#60a5fa";
    case "STARRED":
    case "IMPORTANT":
      return "#facc15";
    case "SENT":
      return "#9ca3af";
    case "DRAFT":
      return "#d946ef";
    case "TRASH":
      return "#f87171";
    case "SPAM":
      return "#fb923c";
    case "ARCHIVE":
    case "ALL MAIL":
      return "#6b7280";
    default: {
      const colors = [
        "#60a5fa",
        "#34d399",
        "#fb923c",
        "#a78bfa",
        "#fb7185",
        "#38bdf8",
        "#fdba74",
        "#86efac",
      ];
      const hash = [...name].reduce((acc, char) => (acc + char.charCodeAt(0)) % 256, 0);
      return colors[hash % colors.length]!;
    }
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.slice(1);
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function extractEmail(value?: string | null): string | null {
  if (!value) return null;
  const angle = value.match(/<([^>]+@[^>]+)>/);
  if (angle?.[1]) return angle[1].trim();
  const bare = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return bare?.[0] ?? null;
}
