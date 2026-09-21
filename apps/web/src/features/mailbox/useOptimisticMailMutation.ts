import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import {
  archiveMessages,
  markReadMessages,
  modifyLabels,
  moveMessagesToLabel,
  readAndArchiveMessages,
  routeMessages,
  shellKey,
  spamMessages,
  starMessages,
  trashMessages,
  undoMutation,
} from "./api";
import type {
  AccountMutationResult,
  MailboxResponse,
  MessageGroupView,
  MutationResponse,
} from "./types";
import { requestAccountReauth } from "@/features/accounts/reauthRequest";
import { requestCoordinator } from "@/lib/requestCoordinator";
import { useSelection } from "@/state/selectionStore";
import { useUndo } from "@/state/undoStore";

const UNDO_TOAST_DURATION_MS = 5_000;

/** Undo a mutation by id and refresh every mail surface. Shared by the
 * success-toast Undo button and the global `z` shortcut. */
export function performUndo(qc: QueryClient, mutationId: string): Promise<void> {
  return undoMutation(mutationId)
    .then(() => {
      const undo = useUndo.getState();
      if (undo.lastMutationId === mutationId) undo.clear();
      toast.success("Undo applied", { className: "toast-category-undo" });
      void qc.invalidateQueries({ queryKey: ["mailbox"] });
      void qc.invalidateQueries({ queryKey: ["thread"] });
      void qc.invalidateQueries({ queryKey: shellKey });
    })
    .catch((error: Error) => {
      toast.error("Undo failed", { description: error.message });
    });
}

export type MailAction =
  | "archive"
  | "trash"
  | "spam"
  | "star"
  | "unstar"
  | "read"
  | "unread"
  | "read-and-archive"
  | "move"
  | "route"
  | "label-add"
  | "label-remove";

export interface MailActionPayload {
  /** Required for label/move actions — the label name being added, removed, or moved into. */
  label?: string;
  /** Current mailbox label for a move; omitted when the source is not a concrete mailbox. */
  sourceLabel?: string;
  /** Route source queue label and optional archive flag. */
  fromQueueLabel?: string;
  archive?: boolean;
}

/**
 * Per-call mutation input. Existing callers can keep passing `string[]`; the
 * object form is used when a drop target supplies a dynamic label payload.
 */
export interface MailMutationInput {
  messageIds: string[];
  payload?: MailActionPayload;
}

export type MailMutationVariables = string[] | MailMutationInput;

interface MutationContext {
  snapshots: Array<[readonly unknown[], unknown]>;
  payload?: MailActionPayload;
}

const AUTH_RECOVERY_ERROR =
  /oauth|auth|token|invalid_client|invalid_grant|no sync provider configured|no sync-capable accounts configured|account unavailable/i;

const destructiveActions = new Set<MailAction>([
  "archive",
  "trash",
  "spam",
  "read-and-archive",
  "move",
  "route",
  "label-remove",
]);

interface InfiniteMailboxData {
  pages: MailboxResponse[];
  pageParams: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMailboxResponse(value: unknown): value is MailboxResponse {
  return isRecord(value) && isRecord(value.mailbox) && Array.isArray(value.mailbox.groups);
}

function isInfiniteMailboxData(value: unknown): value is InfiniteMailboxData {
  return (
    isRecord(value) &&
    Array.isArray(value.pages) &&
    Array.isArray(value.pageParams) &&
    value.pages.every(isMailboxResponse)
  );
}

function mapMailboxRows(
  data: MailboxResponse,
  ids: Set<string>,
  action: MailAction,
): MailboxResponse {
  const groups = data.mailbox.groups
    .map((group): MessageGroupView => {
      let rows = group.rows;
      if (destructiveActions.has(action)) {
        rows = rows.filter((row) => !ids.has(row.id));
      } else {
        rows = rows.map((row) => {
          if (!ids.has(row.id)) return row;
          if (action === "star" || action === "unstar")
            return { ...row, starred: action === "star" };
          if (action === "read" || action === "unread")
            return { ...row, unread: action === "unread" };
          return row;
        });
      }
      return { ...group, rows };
    })
    .filter((group) => group.rows.length > 0);
  return { ...data, mailbox: { ...data.mailbox, groups } };
}

function snapshotAndMutate(qc: QueryClient, ids: string[], action: MailAction): MutationContext {
  const idSet = new Set(ids);
  const snapshots: MutationContext["snapshots"] = [];
  for (const [queryKey, data] of qc.getQueriesData({ queryKey: ["mailbox"] })) {
    if (isMailboxResponse(data)) {
      snapshots.push([queryKey, data]);
      qc.setQueryData(queryKey, mapMailboxRows(data, idSet, action));
      continue;
    }
    if (!isInfiniteMailboxData(data)) continue;
    snapshots.push([queryKey, data]);
    qc.setQueryData(queryKey, {
      ...data,
      pages: data.pages.map((page) => mapMailboxRows(page, idSet, action)),
    });
  }
  return { snapshots };
}

function restore(qc: QueryClient, context?: MutationContext) {
  for (const [queryKey, data] of context?.snapshots ?? []) {
    qc.setQueryData(queryKey, data);
  }
}

function runAction(
  action: MailAction,
  ids: string[],
  payload?: MailActionPayload,
): Promise<MutationResponse> {
  switch (action) {
    case "archive":
      return archiveMessages(ids);
    case "trash":
      return trashMessages(ids);
    case "spam":
      return spamMessages(ids);
    case "star":
      return starMessages(ids, true);
    case "unstar":
      return starMessages(ids, false);
    case "read":
      return markReadMessages(ids, true);
    case "unread":
      return markReadMessages(ids, false);
    case "read-and-archive":
      return readAndArchiveMessages(ids);
    case "move": {
      if (!payload?.label) throw new Error("move requires a target label");
      return moveMessagesToLabel(ids, payload.label, payload.sourceLabel);
    }
    case "route": {
      if (!payload?.label) throw new Error("route requires a target label");
      if (!payload.fromQueueLabel) throw new Error("route requires a source queue label");
      return routeMessages({
        messageIds: ids,
        toLabel: payload.label,
        fromQueueLabel: payload.fromQueueLabel,
        archive: payload.archive ?? true,
      });
    }
    case "label-add": {
      if (!payload?.label) throw new Error("label-add requires a label");
      return modifyLabels(ids, [payload.label], []);
    }
    case "label-remove": {
      if (!payload?.label) throw new Error("label-remove requires a label");
      return modifyLabels(ids, [], [payload.label]);
    }
  }
}

function mutationCompleted(response: MutationResponse): boolean {
  if (!response.ok) return false;
  const result = response.result;
  if (!result) return true;
  return result.succeeded === result.requested && result.skipped === 0 && result.failed === 0;
}

function mutationFailureDescription(response: MutationResponse, requestedFallback: number): string {
  const result = response.result;
  if (!result) return "Bridge rejected the mutation.";

  const accountErrors =
    result.accounts
      ?.filter((account) => account.error)
      .map((account) => `${account.account_name}: ${account.error}`) ?? [];
  const counts = `requested ${result.requested}, succeeded ${result.succeeded}, skipped ${result.skipped}, failed ${result.failed}`;
  const prefix =
    result.succeeded > 0
      ? `Only ${result.succeeded} of ${result.requested || requestedFallback} messages changed`
      : "No messages changed";

  if (accountErrors.length > 0) return `${prefix} (${counts}). ${accountErrors.join("; ")}`;
  return `${prefix} (${counts}).`;
}

function assertMutationCompleted(response: MutationResponse, messageCount: number) {
  if (mutationCompleted(response)) return;
  throw new MutationFailureError(mutationFailureDescription(response, messageCount), response);
}

class MutationFailureError extends Error {
  constructor(
    message: string,
    readonly response: MutationResponse,
  ) {
    super(message);
    this.name = "MutationFailureError";
  }
}

function findReauthableAccount(error: Error): AccountMutationResult | null {
  if (!(error instanceof MutationFailureError)) return null;
  return (
    error.response.result?.accounts?.find(
      (account) => account.error && AUTH_RECOVERY_ERROR.test(account.error),
    ) ?? null
  );
}

function actionLabel(action: MailAction, payload?: MailActionPayload): string {
  switch (action) {
    case "archive":
      return "Archived";
    case "trash":
      return "Moved to trash";
    case "spam":
      return "Marked spam";
    case "star":
      return "Starred";
    case "unstar":
      return "Unstarred";
    case "read":
      return "Marked read";
    case "unread":
      return "Marked unread";
    case "read-and-archive":
      return "Marked read and archived";
    case "move":
      return payload?.label ? `Moved to ${payload.label}` : "Moved";
    case "route":
      return payload?.label ? `Routed to ${payload.label}` : "Routed";
    case "label-add":
      return payload?.label ? `Labelled ${payload.label}` : "Labelled";
    case "label-remove":
      return payload?.label ? `Unlabelled ${payload.label}` : "Unlabelled";
  }
}

export interface MailMutationOptions {
  silentSuccess?: boolean;
  /** Required for label-add / label-remove / move. */
  payload?: MailActionPayload;
}

function normalizeMutationInput(
  input: MailMutationVariables,
  fallbackPayload?: MailActionPayload,
): MailMutationInput {
  if (Array.isArray(input)) return { messageIds: input, payload: fallbackPayload };
  return {
    messageIds: input.messageIds,
    payload: input.payload ?? fallbackPayload,
  };
}

export function useOptimisticMailMutation(action: MailAction, options: MailMutationOptions = {}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const clearSelection = useSelection((state) => state.clear);
  const { silentSuccess, payload } = options;
  return useMutation({
    mutationFn: async (input: MailMutationVariables) => {
      const { messageIds, payload: resolvedPayload } = normalizeMutationInput(input, payload);
      const response = await requestCoordinator.enqueueMutation(() =>
        runAction(action, messageIds, resolvedPayload),
      );
      assertMutationCompleted(response, messageIds.length);
      return response;
    },
    onMutate: async (input) => {
      const { messageIds, payload: resolvedPayload } = normalizeMutationInput(input, payload);
      await qc.cancelQueries({ queryKey: ["mailbox"] });
      const context = snapshotAndMutate(qc, messageIds, action);
      clearSelection();
      return { ...context, payload: resolvedPayload };
    },
    onError: (error, input, context) => {
      const resolvedPayload = context?.payload ?? normalizeMutationInput(input, payload).payload;
      restore(qc, context);
      const reauthAccount = findReauthableAccount(error);
      toast.error(`${actionLabel(action, resolvedPayload)} failed`, {
        description: error.message,
        action: reauthAccount
          ? {
              label: `Re-auth ${reauthAccount.account_name}`,
              onClick: () => {
                requestAccountReauth(reauthAccount.account_id);
                void navigate({
                  to: "/accounts/$key",
                  params: { key: reauthAccount.account_id },
                });
              },
            }
          : undefined,
      });
    },
    onSuccess: (response, input) => {
      if (silentSuccess) return;
      const { messageIds, payload: resolvedPayload } = normalizeMutationInput(input, payload);
      const count = response.result?.succeeded ?? messageIds.length;
      const label = actionLabel(action, resolvedPayload);
      const mutationId = response.result?.mutation_id;
      const readStateClass =
        action === "read" || action === "unread" ? "toast-category-read-state" : undefined;
      if (mutationId) {
        useUndo.getState().setLastMutationId(mutationId);
        toast.success(`${label} ${count}`, {
          className: readStateClass ?? "toast-category-undo",
          duration: UNDO_TOAST_DURATION_MS,
          description: "z to undo",
          action: {
            label: "Undo",
            onClick: () => {
              void performUndo(qc, mutationId);
            },
          },
        });
      } else if (readStateClass) {
        toast.success(`${label} ${count}`, { className: readStateClass });
      } else {
        toast.success(`${label} ${count}`);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["mailbox"] });
      void qc.invalidateQueries({ queryKey: ["thread"] });
      void qc.invalidateQueries({ queryKey: shellKey });
    },
  });
}
