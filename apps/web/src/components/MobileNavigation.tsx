import { useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";

import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Mobile navigation trigger and full-height navigation sheet. */
export function MobileNavigation() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const [openAtPath, setOpenAtPath] = useState<string | null>(null);
  const open = openAtPath === path;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => setOpenAtPath(nextOpen ? path : null)}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="shrink-0 md:hidden"
          aria-label="Open navigation"
          data-testid="mobile-navigation-trigger"
        >
          <Menu className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="mobile-navigation-sheet fixed inset-y-0 left-0 top-0 z-50 flex h-[100dvh] w-80 max-w-[calc(100vw-1.5rem)] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-l-0 p-0 shadow-2xl data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-none sm:rounded-none md:hidden"
        aria-describedby="mobile-navigation-description"
      >
        <DialogTitle className="sr-only">Navigation</DialogTitle>
        <DialogDescription id="mobile-navigation-description" className="sr-only">
          Navigate between mailboxes, workspace tools, and settings.
        </DialogDescription>
        <Sidebar mobile onNavigate={() => setOpenAtPath(null)} />
      </DialogContent>
    </Dialog>
  );
}
