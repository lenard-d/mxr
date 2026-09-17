/*
 * User-configurable shortcut definitions and the boundary between persisted
 * preference data and the tinykeys/browser keyboard grammars.
 */

import type { Action } from "@/lib/actions/types";

export type ShortcutScope = "global" | "mailbox";

export const DEFAULT_SHORTCUT_PREFERENCES = {
  "shell.command-palette": "$mod+KeyK",
  "shell.search-palette": "/",
  "shell.help": "Shift+Slash",
  "shell.compose": "KeyC",
  "mail.undo": "KeyZ",
  "nav.inbox": "g i",
  "nav.starred": "g s",
  "nav.drafts": "g d",
  "nav.archive": "g a",
  "nav.trash": "g t",
  "nav.snoozed": "g n",
  "nav.reply-queue": "g l",
  "nav.subscriptions": "g u",
  "nav.rules": "g r",
  "nav.analytics": "g y",
  "mailbox.move-next": "j",
  "mailbox.move-previous": "k",
  "mailbox.go-top": "g g",
  "mailbox.go-bottom": "Shift+g",
  "mailbox.open": "o",
  "mailbox.select": "x",
  "mailbox.select-all": "* a",
  "mailbox.select-none": "* n",
  "mailbox.archive": "e",
  "mailbox.star": "s",
  "mailbox.toggle-read": "m",
  "mailbox.mark-read": "r",
  "mailbox.mark-unread": "u",
  "mailbox.trash": "#",
  "mailbox.spam": "!",
  "mailbox.focus-sidebar": "h",
} as const;

export type ShortcutActionId = keyof typeof DEFAULT_SHORTCUT_PREFERENCES;
export type ShortcutPreferences = {
  [ActionId in ShortcutActionId]: string | null;
};

export interface ShortcutDefinition {
  id: ShortcutActionId;
  label: string;
  scope: ShortcutScope;
  aliases: readonly string[];
}

export interface ReservedShortcutDefinition {
  id: string;
  label: string;
  scope: ShortcutScope;
  aliases: readonly string[];
}

export const GLOBAL_SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
  {
    id: "shell.command-palette",
    label: "Command palette",
    scope: "global",
    aliases: ["Shift+Semicolon"],
  },
  {
    id: "shell.search-palette",
    label: "Search",
    scope: "global",
    aliases: ["Slash", "2", "Digit2"],
  },
  { id: "shell.help", label: "Help", scope: "global", aliases: [] },
  { id: "shell.compose", label: "Compose", scope: "global", aliases: [] },
  { id: "mail.undo", label: "Undo last action", scope: "global", aliases: [] },
  { id: "nav.inbox", label: "Go to Inbox", scope: "global", aliases: ["1", "Digit1"] },
  { id: "nav.starred", label: "Go to Starred", scope: "global", aliases: [] },
  { id: "nav.drafts", label: "Go to Drafts", scope: "global", aliases: [] },
  { id: "nav.archive", label: "Go to All Mail", scope: "global", aliases: [] },
  { id: "nav.trash", label: "Go to Trash", scope: "global", aliases: [] },
  { id: "nav.snoozed", label: "Go to Snoozed", scope: "global", aliases: [] },
  { id: "nav.reply-queue", label: "Go to Reply queue", scope: "global", aliases: [] },
  { id: "nav.subscriptions", label: "Go to Subscriptions", scope: "global", aliases: [] },
  { id: "nav.rules", label: "Go to Rules", scope: "global", aliases: [] },
  { id: "nav.analytics", label: "Analytics", scope: "global", aliases: ["3", "Digit3"] },
];

export const MAILBOX_SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
  {
    id: "mailbox.move-next",
    label: "Move to next message",
    scope: "mailbox",
    aliases: ["ArrowDown"],
  },
  {
    id: "mailbox.move-previous",
    label: "Move to previous message",
    scope: "mailbox",
    aliases: ["ArrowUp"],
  },
  { id: "mailbox.go-top", label: "Jump to top", scope: "mailbox", aliases: [] },
  { id: "mailbox.go-bottom", label: "Jump to bottom", scope: "mailbox", aliases: ["End"] },
  {
    id: "mailbox.open",
    label: "Open focused message",
    scope: "mailbox",
    aliases: ["Enter", "l", "ArrowRight"],
  },
  {
    id: "mailbox.select",
    label: "Select focused message",
    scope: "mailbox",
    aliases: ["Shift+x"],
  },
  {
    id: "mailbox.select-all",
    label: "Select all messages",
    scope: "mailbox",
    aliases: ["$mod+KeyA"],
  },
  { id: "mailbox.select-none", label: "Select no messages", scope: "mailbox", aliases: [] },
  { id: "mailbox.archive", label: "Archive", scope: "mailbox", aliases: [] },
  { id: "mailbox.star", label: "Star or unstar", scope: "mailbox", aliases: [] },
  {
    id: "mailbox.toggle-read",
    label: "Toggle read/unread",
    scope: "mailbox",
    aliases: [],
  },
  {
    id: "mailbox.mark-read",
    label: "Mark read",
    scope: "mailbox",
    aliases: ["Shift+r"],
  },
  {
    id: "mailbox.mark-unread",
    label: "Mark unread",
    scope: "mailbox",
    aliases: ["Shift+u"],
  },
  {
    id: "mailbox.trash",
    label: "Move to trash",
    scope: "mailbox",
    aliases: ["Delete", "Backspace"],
  },
  { id: "mailbox.spam", label: "Report spam", scope: "mailbox", aliases: [] },
  {
    id: "mailbox.focus-sidebar",
    label: "Focus sidebar",
    scope: "mailbox",
    aliases: ["ArrowLeft"],
  },
];

/** Runtime bindings that are not editable but must not be silently shadowed. */
export const RESERVED_SHORTCUT_DEFINITIONS: readonly ReservedShortcutDefinition[] = [
  { id: "nav.screener", label: "Screener", scope: "global", aliases: ["5", "Digit5"] },
  { id: "nav.accounts", label: "Accounts", scope: "global", aliases: ["8", "Digit8"] },
  {
    id: "nav.diagnostics",
    label: "Diagnostics",
    scope: "global",
    aliases: ["9", "Digit9"],
  },
  { id: "nav.settings", label: "Settings", scope: "global", aliases: ["0", "Digit0"] },
];

export const CONFIGURABLE_SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
  ...GLOBAL_SHORTCUT_DEFINITIONS,
  ...MAILBOX_SHORTCUT_DEFINITIONS,
];

const definitionsById = new Map<string, ShortcutDefinition>();
for (const definition of CONFIGURABLE_SHORTCUT_DEFINITIONS) {
  definitionsById.set(definition.id, definition);
}

const namedKeys = new Set([
  "Escape",
  "Enter",
  "Tab",
  "Space",
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Insert",
  "Slash",
  "Semicolon",
  "Quote",
  "BracketLeft",
  "BracketRight",
  "Backslash",
  "Backquote",
  "Minus",
  "Equal",
  "Comma",
  "Period",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
]);
const modifiers = new Set(["$mod", "Control", "Alt", "Meta", "Shift"]);
const compactSequences: Record<string, string> = {
  gg: "g g",
  "*a": "* a",
  "*n": "* n",
};

export interface ShortcutIssue {
  actionId: string;
  scope: ShortcutScope;
  kind: "invalid" | "duplicate" | "prefix";
  message: string;
}

export interface ShortcutValidation {
  valid: boolean;
  value: string | null;
  error?: string;
}

export function defaultShortcutPreferences(): ShortcutPreferences {
  return { ...DEFAULT_SHORTCUT_PREFERENCES };
}

export function isShortcutActionId(value: string): value is ShortcutActionId {
  return Object.prototype.hasOwnProperty.call(DEFAULT_SHORTCUT_PREFERENCES, value);
}

export function normalizeShortcut(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const expanded = compactSequences[trimmed] ?? trimmed;
  return expanded.split(/\s+/).map(normalizeShortcutToken).join(" ");
}

export function shortcutSyntaxError(value: string): string | undefined {
  const normalized = normalizeShortcut(value);
  if (!normalized) return undefined;
  const tokens = normalized.split(" ");
  if (tokens.length > 3) return "Use at most three keys in a shortcut sequence.";
  for (const token of tokens) {
    const pieces = token.split("+");
    const key = pieces.at(-1) ?? "";
    const tokenModifiers = pieces.slice(0, -1);
    if (!key) return "Every shortcut needs a key.";
    const seenModifiers = new Set<string>();
    for (const modifier of tokenModifiers) {
      if (!modifiers.has(modifier)) return `Unsupported modifier "${modifier}".`;
      if (seenModifiers.has(modifier)) return `Modifier "${modifier}" is repeated.`;
      seenModifiers.add(modifier);
    }
    if (!isShortcutKey(key)) return `Unsupported key "${key}".`;
  }
  return undefined;
}

export function validateShortcutPreferences(
  preferences: Partial<ShortcutPreferences>,
): ShortcutIssue[] {
  const issues: ShortcutIssue[] = [];
  const bindings: ShortcutBinding[] = [];

  for (const definition of CONFIGURABLE_SHORTCUT_DEFINITIONS) {
    const configured = preferences[definition.id];
    const value = configured === undefined ? DEFAULT_SHORTCUT_PREFERENCES[definition.id] : configured;
    if (value !== null) {
      const normalized = normalizeShortcut(value);
      const syntaxError = shortcutSyntaxError(normalized);
      if (syntaxError) {
        issues.push({
          actionId: definition.id,
          scope: definition.scope,
          kind: "invalid",
          message: syntaxError,
        });
      } else {
        bindings.push({
          actionId: definition.id,
          label: definition.label,
          scope: definition.scope,
          shortcut: canonicalShortcut(normalized),
          displayShortcut: normalized,
        });
      }
    }
    if (value !== null) {
      for (const alias of definition.aliases) {
        bindings.push({
          actionId: definition.id,
          label: definition.label,
          scope: definition.scope,
          shortcut: canonicalShortcut(alias),
          displayShortcut: normalizeShortcut(alias),
        });
      }
    }
  }

  for (const definition of RESERVED_SHORTCUT_DEFINITIONS) {
    for (const alias of definition.aliases) {
      bindings.push({
        actionId: definition.id,
        label: definition.label,
        scope: definition.scope,
        shortcut: canonicalShortcut(alias),
        displayShortcut: normalizeShortcut(alias),
      });
    }
  }

  const reported = new Set<string>();
  for (let index = 0; index < bindings.length; index += 1) {
    const first = bindings[index];
    if (!first) continue;
    for (let nextIndex = index + 1; nextIndex < bindings.length; nextIndex += 1) {
      const second = bindings[nextIndex];
      if (!second || first.scope !== second.scope || first.actionId === second.actionId) continue;
      const duplicate = first.shortcut === second.shortcut;
      const prefix = isStrictShortcutPrefix(first.shortcut, second.shortcut);
      const reversePrefix = isStrictShortcutPrefix(second.shortcut, first.shortcut);
      if (!duplicate && !prefix && !reversePrefix) continue;
      const kind = duplicate ? "duplicate" : "prefix";
      const key = [kind, first.actionId, second.actionId, first.shortcut, second.shortcut].join("|");
      if (reported.has(key)) continue;
      reported.add(key);
      addConflictIssue(issues, first, second, kind);
      addConflictIssue(issues, second, first, kind);
    }
  }

  return issues;
}

export function validateShortcutValue(
  actionId: ShortcutActionId,
  rawValue: string,
  current: ShortcutPreferences,
): ShortcutValidation {
  const normalized = normalizeShortcut(rawValue);
  const syntaxError = shortcutSyntaxError(normalized);
  if (syntaxError) return { valid: false, value: null, error: syntaxError };
  const value = normalized || null;
  const candidate: ShortcutPreferences = { ...current, [actionId]: value };
  const issue = validateShortcutPreferences(candidate).find(
    (item) => item.actionId === actionId,
  );
  if (issue) return { valid: false, value, error: issue.message };
  return { valid: true, value };
}

export function sanitizeShortcutPreferences(value: unknown): ShortcutPreferences {
  const sanitized = defaultShortcutPreferences();
  if (!isRecord(value)) return sanitized;

  for (const definition of CONFIGURABLE_SHORTCUT_DEFINITIONS) {
    const rawValue = value[definition.id];
    if (rawValue !== null && typeof rawValue !== "string") continue;
    const normalized = rawValue === null ? null : normalizeShortcut(rawValue);
    if (normalized !== null && shortcutSyntaxError(normalized)) continue;
    const nextValue = normalized || null;
    const candidate: ShortcutPreferences = { ...sanitized, [definition.id]: nextValue };
    const hasIssue = validateShortcutPreferences(candidate).some(
      (issue) => issue.actionId === definition.id,
    );
    if (!hasIssue) sanitized[definition.id] = nextValue;
  }

  return sanitized;
}

export function getShortcutDefinition(actionId: string): ShortcutDefinition | undefined {
  return definitionsById.get(actionId);
}

export function getShortcutValues(
  actionId: ShortcutActionId,
  preferences: ShortcutPreferences,
): string[] {
  const definition = definitionsById.get(actionId);
  if (!definition) return [];
  const configured = preferences[actionId];
  if (configured === null) return [];
  const primary = configured ?? DEFAULT_SHORTCUT_PREFERENCES[actionId];
  return uniqueShortcuts([primary, ...definition.aliases]);
}

export function hasShortcutInScope(
  shortcut: string,
  scope: ShortcutScope,
  preferences: ShortcutPreferences,
): boolean {
  const normalized = canonicalShortcut(shortcut);
  return CONFIGURABLE_SHORTCUT_DEFINITIONS.some(
    (definition) =>
      definition.scope === scope &&
      getShortcutValues(definition.id, preferences).some((value) => canonicalShortcut(value) === normalized),
  );
}

export function getEffectiveShortcut(
  action: Pick<Action, "id" | "shortcut">,
  preferences: ShortcutPreferences,
): string | undefined {
  if (!isShortcutActionId(action.id)) return action.shortcut;
  const configured = preferences[action.id];
  if (configured === null) return undefined;
  return configured ?? action.shortcut;
}

export function getEffectiveActionShortcuts(
  action: Pick<Action, "id" | "shortcut" | "aliases">,
  preferences: ShortcutPreferences,
): string[] {
  if (isShortcutActionId(action.id)) {
    const configured = preferences[action.id];
    if (configured === null) return [];
    return uniqueShortcuts([
      configured ?? action.shortcut,
      ...(action.aliases ?? []),
    ]);
  }
  return uniqueShortcuts([action.shortcut, ...(action.aliases ?? [])]);
}

export function formatShortcutForDisplay(shortcut: string | null | undefined): string {
  if (!shortcut) return "Disabled";
  const normalized = normalizeShortcut(shortcut);
  if (!normalized) return "Disabled";
  return normalized.split(" ").map(formatShortcutToken).join("");
}

export function matchesShortcutToken(event: KeyboardEvent, rawToken: string): boolean {
  const token = normalizeShortcutToken(rawToken);
  const pieces = token.split("+");
  const key = pieces.at(-1) ?? "";
  const expectedModifiers = new Set(pieces.slice(0, -1));
  const expectedMod = expectedModifiers.has("$mod");
  const expectedControl = expectedModifiers.has("Control");
  const expectedAlt = expectedModifiers.has("Alt");
  const expectedMeta = expectedModifiers.has("Meta");
  const expectedShift = expectedModifiers.has("Shift");
  const shiftPressed =
    event.shiftKey ||
    (isAlphabeticKey(event.key) && event.key === event.key.toUpperCase());

  if (expectedMod ? !(event.ctrlKey || event.metaKey) : event.ctrlKey !== expectedControl) {
    return false;
  }
  if (expectedMeta && !event.metaKey) return false;
  if (expectedAlt !== event.altKey) return false;
  if (expectedShift !== shiftPressed && !matchesLiteralShiftedKey(event, key)) return false;
  if (!expectedModifiers.has("Shift") && shiftPressed && isAlphabeticKey(key)) return false;
  return eventMatchesKey(event, key);
}

export function matchesShortcutSequence(
  events: readonly KeyboardEvent[],
  shortcut: string,
): boolean {
  const tokens = shortcutTokens(shortcut);
  return (
    events.length === tokens.length &&
    events.every((event, index) => {
      const token = tokens[index];
      return token !== undefined && matchesShortcutToken(event, token);
    })
  );
}

export function isShortcutSequencePrefix(
  events: readonly KeyboardEvent[],
  shortcut: string,
): boolean {
  const tokens = shortcutTokens(shortcut);
  return (
    events.length < tokens.length &&
    events.every((event, index) => {
      const token = tokens[index];
      return token !== undefined && matchesShortcutToken(event, token);
    })
  );
}

export function isShortcutSuppressed(event: Pick<KeyboardEvent, "target">): boolean {
  if (typeof Element === "undefined") return false;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (
    target.closest(
      'input, textarea, select, dialog, [role="dialog"], [aria-modal="true"], [data-composer], [data-composer-control], .cm-editor',
    )
  ) {
    return true;
  }
  const contentEditable = target.closest("[contenteditable]");
  return contentEditable?.getAttribute("contenteditable") !== "false" && contentEditable !== null;
}

function normalizeShortcutToken(token: string): string {
  if (token === "Esc") return "Escape";
  const pieces = token.split("+");
  const rawKey = pieces.at(-1) ?? "";
  const rawModifiers = pieces.slice(0, -1).map(normalizeModifier);
  const key = isAlphabeticKey(rawKey) ? rawKey.toLowerCase() : rawKey;
  if (rawKey.length === 1 && rawKey !== key && !rawModifiers.includes("Shift")) {
    rawModifiers.push("Shift");
  }
  return [...rawModifiers, key].join("+");
}

function shortcutTokens(shortcut: string): string[] {
  const normalized = normalizeShortcut(shortcut);
  return normalized ? normalized.split(" ") : [];
}

function normalizeModifier(modifier: string): string {
  if (modifier === "Mod" || modifier === "Cmd" || modifier === "Command") return "$mod";
  if (modifier === "Ctrl") return "Control";
  if (modifier === "Option") return "Alt";
  return modifier;
}

function isShortcutKey(key: string): boolean {
  return (
    (key.length === 1 && key !== " " && key !== "+") ||
    namedKeys.has(key) ||
    /^Key[A-Z]$/.test(key) ||
    /^Digit[0-9]$/.test(key)
  );
}

function isAlphabeticKey(key: string): boolean {
  return key.length === 1 && /^[A-Za-z]$/.test(key);
}

function matchesLiteralShiftedKey(event: KeyboardEvent, key: string): boolean {
  return key.length === 1 && !isAlphabeticKey(key) && event.key === key;
}

function canonicalShortcut(value: string): string {
  return normalizeShortcut(value)
    .split(" ")
    .map((token) => canonicalToken(token))
    .join(" ");
}

function canonicalToken(value: string): string {
  const token = normalizeShortcutToken(value);
  const pieces = token.split("+");
  const rawKey = pieces.at(-1) ?? "";
  const key =
    /^Key[A-Z]$/.test(rawKey)
      ? rawKey.slice(3).toLowerCase()
      : /^Digit[0-9]$/.test(rawKey)
        ? rawKey.slice(5)
        : rawKey === "Slash"
          ? "/"
          : rawKey === "Semicolon"
            ? ";"
            : rawKey;
  const order = ["$mod", "Control", "Meta", "Alt", "Shift"];
  const tokenModifiers = pieces.slice(0, -1).sort((first, second) => {
    return order.indexOf(first) - order.indexOf(second);
  });
  return [...tokenModifiers, key].join("+");
}

function isStrictShortcutPrefix(first: string, second: string): boolean {
  const firstTokens = first.split(" ");
  const secondTokens = second.split(" ");
  if (firstTokens.length >= secondTokens.length) return false;
  return firstTokens.every((token, index) => token === secondTokens[index]);
}

function addConflictIssue(
  issues: ShortcutIssue[],
  binding: ShortcutBinding,
  other: ShortcutBinding,
  kind: "duplicate" | "prefix",
): void {
  if (!isShortcutActionId(binding.actionId)) return;
  issues.push({
    actionId: binding.actionId,
    scope: binding.scope,
    kind,
    message:
      kind === "duplicate"
        ? `Shortcut "${binding.displayShortcut}" is already used by ${other.label}.`
        : `Shortcut "${binding.displayShortcut}" is a prefix of ${other.label}'s sequence.`,
  });
}

function eventMatchesKey(event: KeyboardEvent, key: string): boolean {
  if (/^Key[A-Z]$/.test(key)) {
    return event.code === key || event.key.toLowerCase() === key.slice(3).toLowerCase();
  }
  if (/^Digit[0-9]$/.test(key)) {
    return event.code === key || event.key === key.slice(5);
  }
  if (key === "Slash") return event.code === key || event.key === "/" || event.key === "?";
  if (key === "Semicolon") return event.code === key || event.key === ";" || event.key === ":";
  if (key === "Space") return event.code === key || event.key === " ";
  if (key.length === 1 && isAlphabeticKey(key)) return event.key.toLowerCase() === key;
  return event.key === key || event.code === key;
}

function formatShortcutToken(value: string): string {
  const token = normalizeShortcutToken(value);
  if (token === "Shift+Slash") return "?";
  if (token === "Shift+Semicolon") return ":";
  const pieces = token.split("+");
  const key = pieces.at(-1) ?? "";
  const hasShift = pieces.includes("Shift");
  const prefix = pieces
    .slice(0, -1)
    .filter((modifier) => modifier !== "Shift")
    .map(formatModifier)
    .join("");
  const formattedKey =
    /^Key[A-Z]$/.test(key) ? key.slice(3).toLowerCase() : /^Digit[0-9]$/.test(key) ? key.slice(5) : key;
  if (hasShift && (isAlphabeticKey(key) || /^Key[A-Z]$/.test(key))) {
    return `${prefix}${formattedKey.toUpperCase()}`;
  }
  return `${prefix}${formattedKey}`;
}

function formatModifier(modifier: string): string {
  if (modifier === "$mod") return "⌘";
  if (modifier === "Control") return "Ctrl+";
  if (modifier === "Meta") return "⌘";
  if (modifier === "Alt") return "Alt+";
  if (modifier === "Shift") return "Shift+";
  return `${modifier}+`;
}

function uniqueShortcuts(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const normalized = normalizeShortcut(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

interface ShortcutBinding {
  actionId: string;
  label: string;
  scope: ShortcutScope;
  shortcut: string;
  displayShortcut: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
