import { List, Mail, MailOpen, Star } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  MAILBOX_STATUS_FILTERS,
  type MailboxStatusFilter as MailboxStatusFilterValue,
} from "./statusFilter";

interface MailboxStatusFilterProps {
  value: MailboxStatusFilterValue;
  onChange: (value: MailboxStatusFilterValue) => void;
}

const filterIcons = {
  all: List,
  unread: Mail,
  read: MailOpen,
  starred: Star,
} as const;

export function MailboxStatusFilter({ value, onChange }: MailboxStatusFilterProps) {
  return (
    <div
      role="group"
      aria-label="Filter mailbox by status"
      className="flex max-w-full shrink-0 items-center gap-1 overflow-x-auto"
    >
      {MAILBOX_STATUS_FILTERS.map((option) => {
        const selected = value === option.value;
        const Icon = filterIcons[option.value];
        return (
          <Button
            key={option.value}
            type="button"
            variant={selected ? "secondary" : "ghost"}
            size="icon-sm"
            aria-pressed={selected}
            aria-label={option.label}
            title={option.label}
            data-mailbox-control="status-filter"
            className="size-8 shrink-0 rounded-md"
            onClick={() => onChange(option.value)}
          >
            <Icon className="size-4" aria-hidden="true" />
          </Button>
        );
      })}
    </div>
  );
}
