import {
  Archive,
  ClipboardList,
  Link as LinkIcon,
  MailOpen,
  MessagesSquare,
  Paperclip,
  ShieldAlert,
  Star,
  Trash2,
} from "lucide-react";
import { useRef, type ReactNode } from "react";

import { useMailRowDrag, type MailDragSource } from "./MailDndContext";
import type { MessageRowView } from "./types";
import { useOptimisticMailMutation } from "./useOptimisticMailMutation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface MailboxRowProps {
  row: MessageRowView;
  selected: boolean;
  focused: boolean;
  onOpen: () => void;
  onOpenWithKeyboard?: () => void;
  onFocusPane: () => void;
  onToggleSelection: (shift: boolean) => void;
  onFocusRow?: () => void;
  /** Rows that should move together when this row is dragged. */
  dragSource?: MailDragSource;
  /**
   * Read-only rows drop the selection checkbox, star toggle, and hover
   * quick-actions (archive/trash/spam/read). Used for lists whose rows
   * aren't directly mutable messages (e.g. stale thread aggregates that
   * carry no message id). Navigation/open still works.
   */
  readOnly?: boolean;
  /** Optional list-specific trailing control, e.g. "Remove from queue". */
  trailingAction?: ReactNode;
}

export function MailboxRow({
  row,
  selected,
  focused,
  onOpen,
  onOpenWithKeyboard,
  onFocusPane,
  onToggleSelection,
  onFocusRow,
  dragSource,
  readOnly = false,
  trailingAction,
}: MailboxRowProps) {
  const star = useOptimisticMailMutation(row.starred ? "unstar" : "star");
  const read = useOptimisticMailMutation(row.unread ? "read" : "unread");
  const selectionShiftRef = useRef(false);
  const conversationCount =
    typeof row.message_count === "number" && row.message_count > 1 ? row.message_count : null;
  const openCommitmentCount =
    typeof row.open_commitment_count === "number" && row.open_commitment_count > 0
      ? row.open_commitment_count
      : null;
  const subject = row.subject || "(no subject)";
  const rowState = `${row.unread ? "unread" : "read"}${selected ? ", selected" : ""}${focused ? ", keyboard focused" : ""}`;
  const drag = useMailRowDrag(row.id, readOnly ? undefined : dragSource);

  return (
    <div
      ref={drag.setNodeRef}
      {...drag.attributes}
      {...drag.listeners}
      role="article"
      tabIndex={0}
      data-read-only={readOnly ? "true" : "false"}
      aria-label={`${rowState}: ${row.sender} ${subject} ${conversationCount ? `conversation thread with ${conversationCount} messages` : ""} ${openCommitmentCount ? `${openCommitmentCount} open ${openCommitmentCount === 1 ? "commitment" : "commitments"}` : ""} ${row.has_attachments ? "has attachments" : ""} ${row.snippet}`}
      data-selected={selected ? "true" : undefined}
      data-focused={focused ? "true" : undefined}
      data-unread={row.unread ? "true" : "false"}
      data-dragging={drag.isDragging ? "true" : undefined}
      onClick={onOpen}
      onFocus={() => {
        onFocusPane();
        onFocusRow?.();
      }}
      onKeyDown={(event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest("button, [role=checkbox], [data-mailbox-control]")) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          (onOpenWithKeyboard ?? onOpen)();
        }
      }}
      className={cn(
        "mailbox-row group relative grid min-w-0 cursor-pointer items-center gap-2 border-b border-border/70 px-3",
        readOnly
          ? "grid-cols-[minmax(120px,200px)_minmax(0,1fr)_auto]"
          : "grid-cols-[32px_28px_minmax(120px,200px)_minmax(0,1fr)_auto]",
        focused && "outline outline-1 outline-inset outline-ring/80",
        drag.isDragging && "opacity-45",
      )}
      style={{ height: "var(--row-height)" }}
    >
      {readOnly ? null : (
        <div
          className="mailbox-selection-lane grid size-8 shrink-0 place-items-center"
          data-mailbox-control="selection"
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onPointerDown={(event) => {
              selectionShiftRef.current = event.shiftKey;
              event.stopPropagation();
            }}
            onKeyDown={(event) => {
              selectionShiftRef.current = event.shiftKey;
              event.stopPropagation();
            }}
            onCheckedChange={() => {
              onToggleSelection(selectionShiftRef.current);
              selectionShiftRef.current = false;
            }}
            aria-label={`${selected ? "Deselect" : "Select"} message from ${row.sender}: ${subject}`}
            className="mailbox-checkbox size-4 rounded-none"
          />
        </div>
      )}

      {readOnly ? null : (
        <button
          type="button"
          data-mailbox-control="star"
          className={cn(
            "mailbox-row-star grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted",
            row.starred && "text-star",
          )}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            star.mutate([row.id]);
          }}
          aria-label={row.starred ? "Unstar" : "Star"}
        >
          <Star className={cn("size-3.5", row.starred && "fill-current")} />
        </button>
      )}

      <div className="mailbox-row-sender flex min-w-0 items-center gap-1.5 text-[length:var(--mail-row-subject-size)]">
        <span className="min-w-0 truncate" title={row.sender_detail ?? row.sender}>
          {row.sender}
        </span>
        {conversationCount ? <ConversationBadge count={conversationCount} /> : null}
      </div>

      <div className="mailbox-row-content flex min-w-0 items-center gap-1.5 whitespace-nowrap">
        <h2 className="mailbox-row-subject min-w-0 shrink truncate text-[length:var(--mail-row-subject-size)] leading-5">
          {subject}
        </h2>
        <span className="mailbox-row-snippet min-w-0 flex-1 truncate text-[length:var(--mail-row-meta-size)] font-normal text-muted-foreground">
          <span aria-hidden="true">— </span>
          {row.snippet}
        </span>
        {row.has_attachments ? (
          <Paperclip
            aria-label="Has attachments"
            className="size-3.5 shrink-0 text-foreground/75"
            role="img"
          >
            <title>{row.attachment_filename ?? "Has attachments"}</title>
          </Paperclip>
        ) : null}
        {row.link_density && row.link_density !== "none" ? (
          <LinkIcon
            aria-label={
              row.link_density === "heavy" ? "Link-heavy body" : "Body has external links"
            }
            role="img"
            className={
              row.link_density === "heavy"
                ? "size-3.5 shrink-0 text-amber-500"
                : "size-3.5 shrink-0 text-foreground/55"
            }
          >
            <title>
              {row.link_density === "heavy" ? "Many external links" : "Has external links"}
            </title>
          </LinkIcon>
        ) : null}
        {openCommitmentCount ? <CommitmentBadge count={openCommitmentCount} /> : null}
        {row.triage_verdict ? (
          <TriageBadge verdict={row.triage_verdict} reason={row.triage_reason ?? row.triage_line} />
        ) : null}
      </div>

      <div className="mailbox-row-trailing relative flex w-24 min-w-0 items-center justify-end justify-self-end">
        <div className="mailbox-row-date max-w-full truncate whitespace-nowrap text-right font-mono text-[length:var(--mail-row-meta-size)] font-normal text-muted-foreground">
          {row.date_label}
        </div>
        {readOnly ? null : (
          <div className="mailbox-row-quick-actions pointer-events-none absolute right-0 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
            <QuickAction
              icon={MailOpen}
              label={row.unread ? "Mark read" : "Mark unread"}
              onClick={() => read.mutate([row.id])}
            />
            <QuickArchive id={row.id} />
          </div>
        )}
        {trailingAction ? (
          <div
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {trailingAction}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TriageBadge({ verdict, reason }: { verdict: string; reason?: string | null }) {
  const normalized = verdict.toUpperCase();
  return (
    <Badge
      variant="outline"
      aria-label={`Triage verdict ${normalized}${reason ? `: ${reason}` : ""}`}
      title={reason ?? `Triage verdict ${normalized}`}
      className={cn(
        "h-5 shrink-0 rounded px-1.5 font-mono text-[10px]",
        normalized === "ACTION" && "border-red-500/45 bg-red-500/15 text-red-600 dark:text-red-300",
        normalized === "FYI" && "border-blue-500/45 bg-blue-500/15 text-blue-600 dark:text-blue-300",
        normalized === "ROUTINE" &&
          "border-muted-foreground/35 bg-muted text-muted-foreground",
      )}
    >
      {normalized}
    </Badge>
  );
}

function CommitmentBadge({ count }: { count: number }) {
  return (
    <Badge
      variant="outline"
      aria-label={`${count} open ${count === 1 ? "commitment" : "commitments"}`}
      title={`${count} unresolved relationship ${count === 1 ? "commitment" : "commitments"}`}
      className="h-5 shrink-0 gap-1 rounded border-amber-500/45 bg-amber-500/15 px-1.5 font-mono text-[10px] text-amber-600 dark:text-amber-300"
    >
      <ClipboardList className="size-3" aria-hidden="true" />
      {count}
    </Badge>
  );
}

function ConversationBadge({ count }: { count: number }) {
  return (
    <Badge
      variant="outline"
      aria-label={`Conversation thread with ${count} messages`}
      title={`${count} messages in this conversation`}
      className="h-5 shrink-0 gap-1 rounded border-primary/45 bg-primary/15 px-1.5 font-mono text-[10px] text-primary"
    >
      <MessagesSquare className="size-3" aria-hidden="true" />
      {count}
    </Badge>
  );
}

function QuickArchive({ id }: { id: string }) {
  const archive = useOptimisticMailMutation("archive");
  const trash = useOptimisticMailMutation("trash");
  const spam = useOptimisticMailMutation("spam");
  return (
    <>
      <QuickAction icon={Archive} label="Archive" onClick={() => archive.mutate([id])} />
      <QuickAction icon={Trash2} label="Trash" onClick={() => trash.mutate([id])} />
      <QuickAction icon={ShieldAlert} label="Spam" onClick={() => spam.mutate([id])} />
    </>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Archive;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      data-mailbox-control="quick-action"
      className="size-10 rounded-md md:size-8"
      aria-label={label}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <Icon className="size-4" />
    </Button>
  );
}
