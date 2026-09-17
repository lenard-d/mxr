import type { RuntimeAccount } from "@/features/compose/api";

export type MailLens =
  | { kind: "inbox" }
  | { kind: "archive" }
  | { kind: "label"; labelId: string }
  | { kind: "saved"; slug: string };

interface MailLocationBase {
  lens: MailLens;
  threadId?: string;
}

export type MailLocation =
  | (MailLocationBase & { source: "canonical"; accountKey: string })
  | (MailLocationBase & { source: "legacy"; accountKey?: undefined });

export type MailAccountResolution =
  | { status: "all"; accountKey: "all"; accountId?: undefined }
  | { status: "loading"; accountKey: string }
  | { status: "resolved"; accountKey: string; accountId: string; account: RuntimeAccount }
  | {
      status: "invalid";
      accountKey: string;
      fallback?: RuntimeAccount;
    }
  | {
      status: "disabled";
      accountKey: string;
      account: RuntimeAccount;
      fallback?: RuntimeAccount;
    };

export interface MailPathInput {
  accountKey: string;
  lens: MailLens;
  threadId?: string;
}

export function accountKeyFor(account: RuntimeAccount): string {
  const key = account.key?.trim();
  return key || account.account_id;
}

export function defaultRuntimeAccount(accounts: RuntimeAccount[]): RuntimeAccount | undefined {
  return accounts.find((account) => account.enabled && account.is_default) ??
    accounts.find((account) => account.enabled);
}

export function resolveMailAccount(
  accountKey: string | undefined,
  accounts: RuntimeAccount[] | undefined,
): MailAccountResolution {
  if (!accountKey || accountKey === "all") return { status: "all", accountKey: "all" };
  if (!accounts) return { status: "loading", accountKey };

  const requestedKey = decodePathSegment(accountKey);
  const account = accounts.find(
    (candidate) =>
      accountKeyFor(candidate) === requestedKey ||
      candidate.account_id === requestedKey ||
      encodeURIComponent(accountKeyFor(candidate)) === accountKey,
  );
  const fallback = defaultRuntimeAccount(accounts);
  if (!account) return { status: "invalid", accountKey, fallback };
  if (!account.enabled) return { status: "disabled", accountKey, account, fallback };
  return {
    status: "resolved",
    accountKey: accountKeyFor(account),
    accountId: account.account_id,
    account,
  };
}

export function buildMailMailboxPath(input: MailPathInput): string {
  const accountKey = encodePathSegment(input.accountKey);
  switch (input.lens.kind) {
    case "inbox":
      return `/mail/${accountKey}/inbox`;
    case "archive":
      return `/mail/${accountKey}/archive`;
    case "label":
      return `/mail/${accountKey}/label/${encodePathSegment(input.lens.labelId)}`;
    case "saved":
      return `/mail/${accountKey}/saved/${encodePathSegment(input.lens.slug)}`;
  }
}

export function buildMailPath(input: MailPathInput): string {
  const mailboxPath = buildMailMailboxPath(input);
  if (!input.threadId) return mailboxPath;
  return `${mailboxPath}/thread/${encodePathSegment(input.threadId)}`;
}

export function buildMailInboxPath(accountKey: string): string {
  return buildMailMailboxPath({ accountKey, lens: { kind: "inbox" } });
}

export function buildMailThreadPathFromMailboxPath(
  mailboxPath: string,
  threadId: string,
): string {
  const location = parseMailLocation(mailboxPath);
  if (!location) return `${trimTrailingSlash(mailboxPath)}/${encodePathSegment(threadId)}`;
  if (location.source === "legacy") {
    return `${trimTrailingSlash(mailboxPath)}/${encodePathSegment(threadId)}`;
  }
  return buildMailPath({
    accountKey: location.accountKey,
    lens: location.lens,
    threadId,
  });
}

export function mailboxPathFromLocation(
  location: MailLocation,
  fallbackAccountKey = "all",
): string {
  return buildMailMailboxPath({
    accountKey: location.accountKey ?? fallbackAccountKey,
    lens: location.lens,
  });
}

export function parseMailLocation(pathname: string): MailLocation | null {
  const parts = pathSegments(pathname);
  if (parts[0] === "mail") return parseCanonicalLocation(parts);
  if (parts[0] === "m") return parseLegacyLocation(parts);
  return null;
}

export function hasMailThread(pathname: string): boolean {
  return Boolean(parseMailLocation(pathname)?.threadId);
}

function parseCanonicalLocation(parts: string[]): MailLocation | null {
  const accountKey = parts[1];
  if (!accountKey) return null;

  const lens = parts[2];
  if (lens === "inbox" || lens === "archive") {
    if (parts.length === 3) {
      return { source: "canonical", accountKey, lens: { kind: lens } };
    }
    if (parts[3] === "thread" && parts[4] && parts.length === 5) {
      return {
        source: "canonical",
        accountKey,
        lens: { kind: lens },
        threadId: parts[4],
      };
    }
    return null;
  }

  if ((lens === "label" || lens === "saved") && parts[3]) {
    const routeLens: MailLens =
      lens === "label"
        ? { kind: "label", labelId: parts[3] }
        : { kind: "saved", slug: parts[3] };
    if (parts.length === 4) return { source: "canonical", accountKey, lens: routeLens };
    if (parts[4] === "thread" && parts[5] && parts.length === 6) {
      return { source: "canonical", accountKey, lens: routeLens, threadId: parts[5] };
    }
  }
  return null;
}

function parseLegacyLocation(parts: string[]): MailLocation | null {
  const mailbox = parts[1];
  if (!mailbox) return { source: "legacy", lens: { kind: "inbox" } };

  if (mailbox === "label" && parts[2]) {
    const lens: MailLens = { kind: "label", labelId: parts[2] };
    if (parts.length === 3) return { source: "legacy", lens };
    if (parts[3] && parts.length === 4) {
      return { source: "legacy", lens, threadId: parts[3] };
    }
    return null;
  }

  if (mailbox === "saved" && parts[2]) {
    const lens: MailLens = { kind: "saved", slug: parts[2] };
    if (parts.length === 3) return { source: "legacy", lens };
    if (parts[3] && parts.length === 4) {
      return { source: "legacy", lens, threadId: parts[3] };
    }
    return null;
  }

  const lens = legacyLens(mailbox);
  if (parts.length === 2) return { source: "legacy", lens };
  if (parts[2] && parts.length === 3) {
    return { source: "legacy", lens, threadId: parts[2] };
  }
  return null;
}

function legacyLens(mailbox: string): MailLens {
  if (mailbox === "inbox") return { kind: "inbox" };
  if (mailbox === "archive" || mailbox === "all-mail") return { kind: "archive" };
  return { kind: "label", labelId: mailbox };
}

function pathSegments(pathname: string): string[] {
  return pathname
    .split("?")[0]
    ?.split("#")[0]
    ?.split("/")
    .filter(Boolean)
    .map(decodePathSegment) ?? [];
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function trimTrailingSlash(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}
