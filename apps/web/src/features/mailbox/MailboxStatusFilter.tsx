import { Button } from "@/components/ui/button";

import {
  MAILBOX_STATUS_FILTERS,
  type MailboxStatusFilter as MailboxStatusFilterValue,
} from "./statusFilter";

interface MailboxStatusFilterProps {
  value: MailboxStatusFilterValue;
  onChange: (value: MailboxStatusFilterValue) => void;
}

export function MailboxStatusFilter({ value, onChange }: MailboxStatusFilterProps) {
  return (
    <div
      role="group"
      aria-label="Filter mailbox by status"
      className="flex max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-md border border-border bg-muted/40 p-0.5"
    >
      {MAILBOX_STATUS_FILTERS.map((option) => {
        const selected = value === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            variant={selected ? "secondary" : "ghost"}
            size="xs"
            aria-pressed={selected}
            data-mailbox-control="status-filter"
            className="h-7 shrink-0 rounded px-2 text-2xs sm:px-2.5"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
