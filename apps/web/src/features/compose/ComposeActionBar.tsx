import {
  Cloud,
  Clock,
  Loader2,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DraftQualityBadges } from "./DraftQualityBadges";
import type { DraftSuggestionResponse } from "./types";

interface ComposeActionBarProps {
  onSend: () => void;
  onSendLater: () => void;
  onAttach: () => void;
  uploading: number;
  busy: boolean;
  saveError: string | null;
  onRetrySave: () => void;
  canServerSave: boolean;
  onRefresh: () => void;
  onServerSave: () => void;
  onDiscard: () => void;
  suggestion: DraftSuggestionResponse | null;
}

export function ComposeActionBar({
  onSend,
  onSendLater,
  onAttach,
  uploading,
  busy,
  saveError,
  onRetrySave,
  canServerSave,
  onRefresh,
  onServerSave,
  onDiscard,
  suggestion,
}: ComposeActionBarProps) {
  return (
    <footer className="shrink-0 border-t border-border bg-card/30">
      <div className="mx-auto flex h-16 w-full max-w-[720px] items-center gap-1.5 px-6">
        <Button
          type="button"
          size="lg"
          onClick={onSend}
          disabled={busy}
          className="compose-primary gap-2 px-5 shadow-sm"
        >
          <Send className="size-4" />
          Send
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onSendLater}
          disabled={busy}
          aria-label="Send later"
          title="Send later (⇧⌘L)"
        >
          <Clock className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onAttach}
          disabled={uploading > 0}
          aria-label="Attach files"
          title="Attach files (⇧⌘A)"
        >
          {uploading > 0 ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Paperclip className="size-3.5" />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="More compose actions"
              title="More compose actions"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem disabled={busy} onSelect={onRefresh}>
              <RefreshCw className="size-3.5" />
              Refresh from daemon
              <DropdownMenuShortcut>⇧⌘R</DropdownMenuShortcut>
            </DropdownMenuItem>
            {canServerSave ? (
              <DropdownMenuItem disabled={busy} onSelect={onServerSave}>
                <Cloud className="size-3.5" />
                Save to server draft
                <DropdownMenuShortcut>⇧⌘S</DropdownMenuShortcut>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={busy}
              onSelect={onDiscard}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-3.5" />
              Discard draft
              <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <DraftQualityBadges suggestion={suggestion} compact />
          {saveError ? (
            <span role="alert" className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-2xs font-medium text-destructive" title={saveError}>
                Not saved — {saveError}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetrySave}
                disabled={busy}
                className="h-6 px-2 text-2xs"
              >
                Retry
              </Button>
            </span>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
