import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sidebar } from "@/components/Sidebar";

interface MobileSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileSidebar({ open, onOpenChange }: MobileSidebarProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="left-0 top-0 h-dvh w-[min(20rem,calc(100vw-2rem))] max-w-none translate-x-0 translate-y-0 gap-0 border-y-0 border-l-0 p-0 sm:rounded-none"
      >
        <DialogTitle className="sr-only">Navigation</DialogTitle>
        <Sidebar forceExpanded keyboardNavigation={false} onNavigate={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
