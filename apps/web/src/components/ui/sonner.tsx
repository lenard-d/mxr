import { Toaster as SonnerToaster } from "sonner";

import { useUiPrefs } from "@/state/uiPrefsStore";

export function Toaster() {
  const theme = useUiPrefs((s) => s.theme);
  const toastPreferences = useUiPrefs((s) => s.toastPreferences);
  const resolved =
    theme === "system" ? "system" : theme === "light" || theme === "paper" ? "light" : "dark";
  return (
    <SonnerToaster
      theme={resolved}
      data-show-error-toasts={toastPreferences.errors}
      data-show-success-toasts={toastPreferences.success}
      data-show-info-toasts={toastPreferences.info}
      data-show-undo-toasts={toastPreferences.undo}
      data-show-sent-toasts={toastPreferences.sent}
      position="top-right"
      duration={4_000}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "relative max-w-[min(420px,calc(100vw-1rem))] rounded-md border border-border bg-popover pr-11 text-popover-foreground shadow-lg",
          title: "text-sm font-medium",
          description: "text-2xs text-muted-foreground",
          closeButton:
            "!absolute !right-2 !top-2 !flex !size-8 !items-center !justify-center !rounded-md !border-border !bg-muted !text-foreground hover:!bg-accent",
          actionButton: "min-h-8 bg-primary text-primary-foreground hover:bg-primary/90",
          cancelButton: "min-h-8 bg-muted text-muted-foreground",
        },
      }}
    />
  );
}
