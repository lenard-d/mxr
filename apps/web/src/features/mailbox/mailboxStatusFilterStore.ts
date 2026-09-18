import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { MAILBOX_STATUS_FILTERS, type MailboxStatusFilter } from "./statusFilter";

interface MailboxStatusFilterState {
  value: MailboxStatusFilter;
  setValue: (value: MailboxStatusFilter) => void;
}

const validFilters = new Set<MailboxStatusFilter>(
  MAILBOX_STATUS_FILTERS.map((filter) => filter.value),
);

export const useMailboxStatusFilter = create<MailboxStatusFilterState>()(
  persist(
    (set) => ({
      value: "all",
      setValue: (value) => set({ value }),
    }),
    {
      name: "mxr.mailboxStatusFilter",
      storage: createJSONStorage(() => window.localStorage),
      merge: (persisted, current) => {
        const value = (persisted as Partial<MailboxStatusFilterState> | undefined)?.value;
        return { ...current, value: value && validFilters.has(value) ? value : "all" };
      },
      partialize: (state) => ({ value: state.value }),
    },
  ),
);
