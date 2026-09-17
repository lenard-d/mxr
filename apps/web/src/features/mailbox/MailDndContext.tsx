import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { toast } from "sonner";

import type { SidebarItem } from "./types";
import {
  useOptimisticMailMutation,
  type MailAction,
  type MailActionPayload,
  type MailMutationInput,
} from "./useOptimisticMailMutation";
import { cn } from "@/lib/utils";

export type MailSystemDropAction = "archive" | "spam" | "trash";

export interface MailDropTarget {
  id: string;
  label: string;
  kind: "user-label" | "system";
  action?: MailSystemDropAction;
  labelId?: string;
  accountId?: string;
}

export interface MailDragSource {
  type: "mail-row";
  messageIds: string[];
  accountIds?: string[];
  preview?: {
    sender?: string;
    subject?: string;
  };
}

export type MailDropResolution =
  | {
      kind: "mutation";
      action: Extract<MailAction, "archive" | "spam" | "trash" | "move">;
      messageIds: string[];
      payload?: MailActionPayload;
    }
  | {
      kind: "reject";
      reason: string;
    };

const MailDndEnabledContext = createContext(false);

/**
 * Convert a sidebar lens into a safe drop target. User labels use the move
 * endpoint; only explicit system destinations are mapped to destructive mail
 * mutations. Inbox, sent, starred, and saved-search links are not targets.
 */
export function resolveSidebarDropTarget(item: SidebarItem): MailDropTarget | undefined {
  const accountId = item.account_id ?? item.accountId ?? item.lens?.accountId ?? undefined;
  const systemAction = item.lens?.dropAction ?? undefined;
  if (systemAction) {
    return {
      id: `system:${systemAction}:${item.id}`,
      label: item.label,
      kind: "system",
      action: systemAction,
      accountId,
    };
  }

  if (item.lens?.kind !== "label") return undefined;
  return {
    id: `label:${accountId ?? "all"}:${item.lens.labelId ?? item.id}`,
    label: item.label,
    kind: "user-label",
    labelId: item.lens.labelId ?? undefined,
    accountId,
  };
}

/**
 * Resolve a completed row-to-sidebar drop without touching React or the API.
 * Keeping this seam pure makes the destructive/system mapping testable and
 * gives callers one place to enforce the cross-account safety rule.
 */
export function resolveMailDrop(source: MailDragSource, target: MailDropTarget): MailDropResolution {
  const messageIds = uniqueStrings(source.messageIds);
  if (messageIds.length === 0) {
    return { kind: "reject", reason: "No messages available to move." };
  }

  const sourceAccounts = new Set(uniqueStrings(source.accountIds ?? []));
  if (
    target.accountId &&
    sourceAccounts.size > 0 &&
    [...sourceAccounts].some((accountId) => accountId !== target.accountId)
  ) {
    return {
      kind: "reject",
      reason: "Messages from another account cannot be dropped here.",
    };
  }

  if (target.kind === "user-label") {
    const label = target.label.trim();
    if (!label) return { kind: "reject", reason: "This label has no name." };
    return {
      kind: "mutation",
      action: "move",
      messageIds,
      payload: { label },
    };
  }

  if (!target.action) {
    return { kind: "reject", reason: "This sidebar item is not a mail destination." };
  }
  return { kind: "mutation", action: target.action, messageIds };
}

export function MailDndProvider({ children }: { children: ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const [activeSource, setActiveSource] = useState<MailDragSource | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const archive = useOptimisticMailMutation("archive");
  const spam = useOptimisticMailMutation("spam");
  const trash = useOptimisticMailMutation("trash");
  const move = useOptimisticMailMutation("move");

  function onDragStart(event: DragStartEvent) {
    const source = mailDragSource(event.active.data.current);
    setActiveSource(source);
    if (source) {
      const count = source.messageIds.length;
      setAnnouncement(`Dragging ${count} ${count === 1 ? "message" : "messages"}.`);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const source = mailDragSource(event.active.data.current);
    const target = mailDropTarget(event.over?.data.current);
    setActiveSource(null);

    if (!source || !target) {
      setAnnouncement("Drop cancelled.");
      return;
    }

    const resolution = resolveMailDrop(source, target);
    if (resolution.kind === "reject") {
      setAnnouncement(resolution.reason);
      toast.error("Messages were not moved", { description: resolution.reason });
      return;
    }

    setAnnouncement(
      `${resolution.messageIds.length} ${resolution.messageIds.length === 1 ? "message" : "messages"} dropped on ${target.label}.`,
    );
    runMutation(resolution, { archive, spam, trash, move });
  }

  return (
    <MailDndEnabledContext.Provider value={true}>
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveSource(null);
          setAnnouncement("Drop cancelled.");
        }}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {activeSource ? <MailDragOverlay source={activeSource} /> : null}
        </DragOverlay>
      </DndContext>
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </MailDndEnabledContext.Provider>
  );
}

export function MailDropTarget({
  target,
  children,
  className,
}: {
  target: MailDropTarget;
  children: ReactNode;
  className?: string;
}) {
  const enabled = useContext(MailDndEnabledContext);
  if (!enabled) return children;
  return <EnabledMailDropTarget target={target} className={className}>{children}</EnabledMailDropTarget>;
}

function EnabledMailDropTarget({
  target,
  children,
  className,
}: {
  target: MailDropTarget;
  children: ReactNode;
  className?: string;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `mail-drop:${target.id}`,
    data: { type: "mail-target", target },
  });
  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={`Drop messages on ${target.label}`}
      data-drop-target={target.id}
      data-drop-active={isOver ? "true" : undefined}
      className={cn(
        "rounded-md transition-colors",
        isOver && "bg-sidebar-accent outline outline-2 outline-sidebar-ring",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MailDragHandle({
  id,
  source,
}: {
  id: string;
  source: MailDragSource;
}) {
  const enabled = useContext(MailDndEnabledContext);
  if (!enabled) return null;
  return <EnabledMailDragHandle id={id} source={source} />;
}

function EnabledMailDragHandle({
  id,
  source,
}: {
  id: string;
  source: MailDragSource;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `mail-row:${id}`,
    data: source,
  });
  const count = source.messageIds.length;
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      data-mailbox-control="drag-handle"
      aria-label={`Drag ${count} ${count === 1 ? "message" : "messages"}`}
      aria-roledescription="draggable"
      title="Drag to a label"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground",
        isDragging && "text-primary opacity-50",
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <GripVertical className="size-3.5" aria-hidden="true" />
    </button>
  );
}

function MailDragOverlay({ source }: { source: MailDragSource }) {
  const count = source.messageIds.length;
  return (
    <div className="flex min-w-52 max-w-xs items-center gap-2 rounded-lg border border-primary/60 bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl">
      <GripVertical className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 truncate font-medium">
        {count === 1
          ? source.preview?.subject || source.preview?.sender || "Move message"
          : `${count} messages`}
      </span>
    </div>
  );
}

function runMutation(
  resolution: Extract<MailDropResolution, { kind: "mutation" }>,
  mutations: {
    archive: ReturnType<typeof useOptimisticMailMutation>;
    spam: ReturnType<typeof useOptimisticMailMutation>;
    trash: ReturnType<typeof useOptimisticMailMutation>;
    move: ReturnType<typeof useOptimisticMailMutation>;
  },
) {
  switch (resolution.action) {
    case "archive":
      mutations.archive.mutate(resolution.messageIds);
      return;
    case "spam":
      mutations.spam.mutate(resolution.messageIds);
      return;
    case "trash":
      mutations.trash.mutate(resolution.messageIds);
      return;
    case "move": {
      const input: MailMutationInput = {
        messageIds: resolution.messageIds,
        payload: resolution.payload,
      };
      mutations.move.mutate(input);
      return;
    }
  }
}

function mailDragSource(value: unknown): MailDragSource | null {
  if (!isRecord(value) || value.type !== "mail-row" || !Array.isArray(value.messageIds)) return null;
  const messageIds = value.messageIds.filter(isString);
  if (messageIds.length === 0) return null;
  const accountIds = Array.isArray(value.accountIds) ? value.accountIds.filter(isString) : undefined;
  const preview = isRecord(value.preview)
    ? {
        sender: isString(value.preview.sender) ? value.preview.sender : undefined,
        subject: isString(value.preview.subject) ? value.preview.subject : undefined,
      }
    : undefined;
  return { type: "mail-row", messageIds, accountIds, preview };
}

function mailDropTarget(value: unknown): MailDropTarget | null {
  if (!isRecord(value) || value.type !== "mail-target" || !isRecord(value.target)) return null;
  const target = value.target;
  if (!isString(target.id) || !isString(target.label)) return null;
  if (target.kind !== "user-label" && target.kind !== "system") return null;
  if (target.kind === "system" && !isMailSystemDropAction(target.action)) {
    return null;
  }
  const action = isMailSystemDropAction(target.action) ? target.action : undefined;
  return {
    id: target.id,
    label: target.label,
    kind: target.kind,
    action,
    labelId: isString(target.labelId) ? target.labelId : undefined,
    accountId: isString(target.accountId) ? target.accountId : undefined,
  };
}

function isMailSystemDropAction(value: unknown): value is MailSystemDropAction {
  return value === "archive" || value === "spam" || value === "trash";
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
