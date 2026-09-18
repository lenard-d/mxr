import { Toaster as SonnerToaster } from "sonner";

import { useUiPrefs } from "@/state/uiPrefsStore";

export function Toaster() {
  const theme = useUiPrefs((s) => s.theme);
  const toastPreferences = useUiPrefs((s) => s.toastPreferences);
  const resolved =
    theme === "system" ? "system" : theme === "light" || theme === "paper" ? "light" : "dark";
  return (
    <SonnerToaster
      className="app-toaster"
      theme={resolved}
      data-show-error-toasts={toastPreferences.errors}
      data-show-success-toasts={toastPreferences.success}
      data-show-info-toasts={toastPreferences.info}
      data-show-undo-toasts={toastPreferences.undo}
      data-show-sent-toasts={toastPreferences.sent}
      data-show-read-state-toasts={toastPreferences.readState}
      position="top-right"
      gap={8}
      visibleToasts={3}
      expand={false}
      duration={4_000}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "relative max-w-[min(420px,calc(100vw-1rem))] !rounded-lg !border !border-border/80 !bg-popover !p-3 !pr-12 !text-popover-foreground !shadow-xl",
          content: "!min-w-0 !flex-1 !gap-0.5",
          title: "!text-sm !font-medium !leading-5",
          description: "!text-2xs !leading-4 !text-muted-foreground",
          closeButton:
            "!absolute !left-auto !right-2 !top-2 !z-10 !flex !size-8 !translate-x-0 !translate-y-0 !transform-none !items-center !justify-center !rounded-md !border !border-border/70 !bg-muted !p-0 !text-muted-foreground hover:!border-border hover:!bg-accent hover:!text-foreground",
          actionButton:
            "!h-8 !min-h-8 !shrink-0 !rounded-md !border !border-primary/60 !bg-primary !px-2.5 !text-2xs !font-medium !text-primary-foreground hover:!bg-primary/90",
          cancelButton:
            "!h-8 !min-h-8 !shrink-0 !rounded-md !border !border-border !bg-muted !px-2.5 !text-2xs !font-medium !text-muted-foreground hover:!bg-accent hover:!text-foreground",
        },
      }}
    />
  );
}
