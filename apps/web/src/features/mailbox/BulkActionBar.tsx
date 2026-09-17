import { Archive, CheckCheck, Clock, Mail, ShieldAlert, Star, Trash2, X } from "lucide-react";
import { useState } from "react";

import { SnoozeDialog } from "./SnoozeDialog";
import type { MessageRowView } from "./types";
import type { MailAction } from "./useOptimisticMailMutation";
import { useOptimisticMailMutation } from "./useOptimisticMailMutation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSelection } from "@/state/selectionStore";

const actions: Array<{ action: MailAction; label: string; icon: typeof Archive }> = [
  { action: "archive", label: "Archive", icon: Archive },
  { action: "trash", label: "Trash", icon: Trash2 },
  { action: "spam", label: "Spam", icon: ShieldAlert },
  { action: "star", label: "Star", icon: Star },
  { action: "read", label: "Read", icon: CheckCheck },
  { action: "unread", label: "Unread", icon: Mail },
];

const confirmBeforeBulk = new Set<MailAction>(["archive", "trash", "spam"]);

interface BulkActionBarProps {
  /** Rows make the master checkbox represent the current view, not all mail. */
  rows?: MessageRowView[];
}

export function BulkActionBar({ rows }: BulkActionBarProps = {}) {
  const ids = useSelection((state) => state.ids);
  const clear = useSelection((state) => state.clear);
  const selectMany = useSelection((state) => state.selectMany);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const hasLoadedRows = rows !== undefined;
  const selected = hasLoadedRows
    ? rows.filter((row) => ids.has(row.id)).map((row) => row.id)
    : [...ids];
  const allLoadedSelected = hasLoadedRows && rows.length > 0 && selected.length === rows.length;
  const someLoadedSelected = hasLoadedRows && selected.length > 0 && !allLoadedSelected;

  if (!hasLoadedRows && selected.length === 0) return null;

  return (
    <>
      <div
        className="sticky top-0 z-20 flex h-10 flex-nowrap items-center gap-1.5 overflow-x-auto border-b border-border bg-background/95 px-3 backdrop-blur"
        role="toolbar"
        aria-label="Mailbox selection and bulk actions"
      >
        {hasLoadedRows ? (
          <div className="mailbox-selection-lane grid size-8 shrink-0 place-items-center">
            <Checkbox
              checked={allLoadedSelected ? true : someLoadedSelected ? "indeterminate" : false}
              onCheckedChange={(checked) => {
                if (checked === true) selectMany(rows.map((row) => row.id));
                else clear();
              }}
              aria-label={
                allLoadedSelected ? "Deselect all messages in view" : "Select all messages in view"
              }
              aria-describedby="mailbox-selection-status"
              data-testid="mailbox-master-checkbox"
              className="mailbox-checkbox size-4 rounded-none"
            />
          </div>
        ) : null}
        <div
          id="mailbox-selection-status"
          role="status"
          aria-live="polite"
          className="mr-1 shrink-0 font-mono text-2xs text-muted-foreground"
        >
          {selected.length > 0 ? `${selected.length} selected` : null}
        </div>
        {selected.length > 0 ? (
          <>
            <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
            {actions.map((item) => (
              <BulkButton
                key={item.action}
                action={item.action}
                label={item.label}
                icon={item.icon}
                ids={selected}
              />
            ))}
            <Button
              variant="ghost"
              size="icon-sm"
              title="Snooze"
              aria-label="Snooze"
              onClick={() => setSnoozeOpen(true)}
            >
              <Clock className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              title="Clear selection"
              aria-label="Clear selection"
              onClick={clear}
            >
              <X className="size-3.5" />
            </Button>
          </>
        ) : null}
      </div>
      {snoozeOpen ? (
        <SnoozeDialog
          open
          messageIds={selected}
          onOpenChange={setSnoozeOpen}
          onSnoozed={clear}
        />
      ) : null}
    </>
  );
}

function BulkButton({
  action,
  label,
  icon: Icon,
  ids,
}: {
  action: MailAction;
  label: string;
  icon: typeof Archive;
  ids: string[];
}) {
  const mutation = useOptimisticMailMutation(action);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const needsConfirm = confirmBeforeBulk.has(action);

  function run() {
    mutation.mutate(ids);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        title={label}
        aria-label={label}
        onClick={() => (needsConfirm ? setConfirmOpen(true) : run())}
        disabled={mutation.isPending}
      >
        <Icon className="size-3.5" />
      </Button>
      {needsConfirm ? (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {label} {ids.length} {ids.length === 1 ? "message" : "messages"}?
              </DialogTitle>
              <DialogDescription>
                This will apply to every selected message. Use Undo from the success toast if you
                change your mind.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                variant={action === "trash" || action === "spam" ? "destructive" : "default"}
                onClick={() => {
                  setConfirmOpen(false);
                  run();
                }}
              >
                <Icon className="size-3" />
                Confirm {label}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
