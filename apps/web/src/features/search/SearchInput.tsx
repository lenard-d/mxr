import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useModals } from "@/state/modalStore";

export function SearchInput({ className }: { className?: string } = {}) {
  const setSearchOpen = useModals((s) => s.setSearchPaletteOpen);

  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        "ml-auto h-10 min-w-0 flex-1 justify-start gap-3 border-primary/55 bg-primary/10 px-4 py-2 text-left text-xs font-normal text-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.1)] hover:border-primary/80 hover:bg-primary/15 sm:h-9 sm:w-[360px] sm:flex-none sm:px-4 sm:py-1.5",
        className,
      )}
      onClick={() => setSearchOpen(true)}
      aria-label="Open mail search"
    >
      <Search className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">Search mail</span>
      <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-2xs text-muted-foreground sm:inline-flex">
        /
      </kbd>
    </Button>
  );
}
