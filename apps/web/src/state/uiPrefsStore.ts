/*
 * Global UI prefs — theme, density, sidebar layout and visibility, compose editor
 * choice. Persisted to localStorage and hydrated synchronously in main.tsx
 * before render so the theme doesn't flash.
 */

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export type Theme = "midnight" | "light" | "eclipse" | "paper" | "system";
export type ResolvedTheme = Exclude<Theme, "system">;
export type Density = "compact" | "regular" | "comfortable";
export type ComposeEditor = "codemirror-vim" | "tiptap";
export type EmailHtmlTheme = "dark" | "original";
export type ReaderLayout = "split" | "full";
export type SidebarFeature =
  | "drafts"
  | "search"
  | "analytics"
  | "rules"
  | "screener"
  | "subscriptions"
  | "reply-queue"
  | "invites"
  | "deliveries"
  | "accounts"
  | "activity"
  | "jobs"
  | "diagnostics";
export type SidebarVisibility = Record<SidebarFeature, boolean>;
export type ToastCategory = "errors" | "success" | "info" | "undo" | "sent";
export type ToastPreferences = Record<ToastCategory, boolean>;
/** Undo-send window in seconds; 0 sends immediately. */
export type UndoSendSeconds = 0 | 5 | 10 | 30;

export const SIDEBAR_WIDTH_MIN = 208;
export const SIDEBAR_WIDTH_MAX = 420;
export const DEFAULT_SIDEBAR_WIDTH = 264;
export const THREAD_SPLIT_RATIO_MIN = 0.28;
export const THREAD_SPLIT_RATIO_MAX = 0.65;
export const DEFAULT_THREAD_SPLIT_RATIO = 0.42;

export const sidebarFeatureOptions: ReadonlyArray<{
  key: SidebarFeature;
  label: string;
  description: string;
}> = [
  { key: "drafts", label: "Drafts", description: "Keep drafts close at hand." },
  { key: "search", label: "Search", description: "Show the saved-search workspace." },
  { key: "analytics", label: "Analytics", description: "Show mail activity and insights." },
  { key: "rules", label: "Rules", description: "Show automation rules." },
  { key: "screener", label: "Screener", description: "Show sender screening tools." },
  { key: "subscriptions", label: "Subscriptions", description: "Show subscription management." },
  { key: "reply-queue", label: "Reply queue", description: "Show messages waiting for a reply." },
  { key: "invites", label: "Calendar invites", description: "Show calendar invite tools." },
  { key: "deliveries", label: "Deliveries", description: "Show delivery tracking." },
  { key: "accounts", label: "Accounts", description: "Show account administration." },
  { key: "activity", label: "Activity log", description: "Show local activity history." },
  { key: "jobs", label: "Jobs", description: "Show background job status." },
  { key: "diagnostics", label: "Diagnostics", description: "Show connection diagnostics." },
];

export const defaultSidebarVisibility: SidebarVisibility = {
  drafts: true,
  search: true,
  analytics: true,
  rules: true,
  screener: true,
  subscriptions: true,
  "reply-queue": true,
  invites: true,
  deliveries: true,
  accounts: true,
  activity: true,
  jobs: true,
  diagnostics: true,
};

const themeValues = new Set(["midnight", "light", "eclipse", "paper", "system"]);
const densityValues = new Set(["compact", "regular", "comfortable"]);
const toastCategories: ToastCategory[] = ["errors", "success", "info", "undo", "sent"];
export const defaultToastPreferences: ToastPreferences = {
  errors: true,
  success: true,
  info: true,
  undo: true,
  sent: true,
};

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && themeValues.has(value);
}

export function isDensity(value: unknown): value is Density {
  return typeof value === "string" && densityValues.has(value);
}

export function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(value)));
}

export function clampThreadSplitRatio(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_THREAD_SPLIT_RATIO;
  return Math.min(THREAD_SPLIT_RATIO_MAX, Math.max(THREAD_SPLIT_RATIO_MIN, value));
}

export interface UiPrefsState {
  theme: Theme;
  density: Density;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  threadSplitRatio: number;
  sidebarVisibility: SidebarVisibility;
  composeEditor: ComposeEditor;
  emailHtmlTheme: EmailHtmlTheme;
  readerLayout: ReaderLayout;
  notificationsEnabled: boolean;
  notifyAllNewMail: boolean;
  vipAllowlist: string[];
  undoSendSeconds: UndoSendSeconds;
  toastPreferences: ToastPreferences;
  setUndoSendSeconds: (seconds: UndoSendSeconds) => void;
  setTheme: (t: Theme) => void;
  setDensity: (d: Density) => void;
  setSidebarCollapsed: (b: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setThreadSplitRatio: (ratio: number) => void;
  setSidebarItemVisible: (item: SidebarFeature, visible: boolean) => void;
  setComposeEditor: (e: ComposeEditor) => void;
  setEmailHtmlTheme: (theme: EmailHtmlTheme) => void;
  setReaderLayout: (layout: ReaderLayout) => void;
  setNotificationsEnabled: (b: boolean) => void;
  setNotifyAllNewMail: (b: boolean) => void;
  addVip: (pattern: string) => void;
  removeVip: (pattern: string) => void;
  setToastPreference: (category: ToastCategory, enabled: boolean) => void;
}

type PersistedUiPrefs = Pick<
  UiPrefsState,
  | "theme"
  | "density"
  | "sidebarCollapsed"
  | "sidebarWidth"
  | "threadSplitRatio"
  | "sidebarVisibility"
  | "composeEditor"
  | "emailHtmlTheme"
  | "readerLayout"
  | "notificationsEnabled"
  | "notifyAllNewMail"
  | "vipAllowlist"
  | "undoSendSeconds"
  | "toastPreferences"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isComposeEditor(value: unknown): value is ComposeEditor {
  return value === "codemirror-vim" || value === "tiptap";
}

function isEmailHtmlTheme(value: unknown): value is EmailHtmlTheme {
  return value === "dark" || value === "original";
}

function isReaderLayout(value: unknown): value is ReaderLayout {
  return value === "split" || value === "full";
}

function isUndoSendSeconds(value: unknown): value is UndoSendSeconds {
  return value === 0 || value === 5 || value === 10 || value === 30;
}

function sanitizePersistedPrefs(value: unknown): Partial<PersistedUiPrefs> {
  const record = isRecord(value) && isRecord(value.state) ? value.state : value;
  if (!isRecord(record)) return {};

  const sanitized: Partial<PersistedUiPrefs> = {};
  if (isTheme(record.theme)) sanitized.theme = record.theme;
  if (isDensity(record.density)) sanitized.density = record.density;
  if (typeof record.sidebarCollapsed === "boolean") {
    sanitized.sidebarCollapsed = record.sidebarCollapsed;
  }
  if (isFiniteNumber(record.sidebarWidth)) {
    sanitized.sidebarWidth = clampSidebarWidth(record.sidebarWidth);
  }
  if (isFiniteNumber(record.threadSplitRatio)) {
    sanitized.threadSplitRatio = clampThreadSplitRatio(record.threadSplitRatio);
  }
  if (isRecord(record.sidebarVisibility)) {
    const sidebarVisibility = { ...defaultSidebarVisibility };
    for (const option of sidebarFeatureOptions) {
      const visible = record.sidebarVisibility[option.key];
      if (typeof visible === "boolean") sidebarVisibility[option.key] = visible;
    }
    sanitized.sidebarVisibility = sidebarVisibility;
  }
  if (isComposeEditor(record.composeEditor)) sanitized.composeEditor = record.composeEditor;
  if (isEmailHtmlTheme(record.emailHtmlTheme)) sanitized.emailHtmlTheme = record.emailHtmlTheme;
  if (isReaderLayout(record.readerLayout)) sanitized.readerLayout = record.readerLayout;
  if (typeof record.notificationsEnabled === "boolean") {
    sanitized.notificationsEnabled = record.notificationsEnabled;
  }
  if (typeof record.notifyAllNewMail === "boolean") {
    sanitized.notifyAllNewMail = record.notifyAllNewMail;
  }
  if (Array.isArray(record.vipAllowlist)) {
    const vipAllowlist = record.vipAllowlist.filter(isString);
    if (vipAllowlist.length === record.vipAllowlist.length) sanitized.vipAllowlist = vipAllowlist;
  }
  if (isUndoSendSeconds(record.undoSendSeconds)) {
    sanitized.undoSendSeconds = record.undoSendSeconds;
  }
  if (isRecord(record.toastPreferences)) {
    const toastPreferences = { ...defaultToastPreferences };
    for (const category of toastCategories) {
      const enabled = record.toastPreferences[category];
      if (typeof enabled === "boolean") toastPreferences[category] = enabled;
    }
    sanitized.toastPreferences = toastPreferences;
  }
  return sanitized;
}

export const useUiPrefs = create<UiPrefsState>()(
  persist(
    (set) => ({
      theme: "midnight",
      density: "regular",
      sidebarCollapsed: false,
      sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
      threadSplitRatio: DEFAULT_THREAD_SPLIT_RATIO,
      sidebarVisibility: { ...defaultSidebarVisibility },
      composeEditor: "tiptap",
      emailHtmlTheme: "dark",
      readerLayout: "split",
      notificationsEnabled: false,
      notifyAllNewMail: false,
      vipAllowlist: [],
      undoSendSeconds: 10,
      toastPreferences: { ...defaultToastPreferences },
      setUndoSendSeconds: (undoSendSeconds) => set({ undoSendSeconds }),
      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth: clampSidebarWidth(sidebarWidth) }),
      setThreadSplitRatio: (threadSplitRatio) =>
        set({ threadSplitRatio: clampThreadSplitRatio(threadSplitRatio) }),
      setSidebarItemVisible: (item, visible) =>
        set((state) => ({
          sidebarVisibility: { ...state.sidebarVisibility, [item]: visible },
        })),
      setComposeEditor: (composeEditor) => set({ composeEditor }),
      setEmailHtmlTheme: (emailHtmlTheme) => set({ emailHtmlTheme }),
      setReaderLayout: (readerLayout) => set({ readerLayout }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setNotifyAllNewMail: (notifyAllNewMail) => set({ notifyAllNewMail }),
      addVip: (pattern) =>
        set((s) => ({
          vipAllowlist: s.vipAllowlist.includes(pattern)
            ? s.vipAllowlist
            : [...s.vipAllowlist, pattern],
        })),
      removeVip: (pattern) =>
        set((s) => ({ vipAllowlist: s.vipAllowlist.filter((p) => p !== pattern) })),
      setToastPreference: (category, enabled) =>
        set((state) => ({
          toastPreferences: { ...state.toastPreferences, [category]: enabled },
        })),
    }),
    {
      name: "mxr.uiPrefs",
      storage: createJSONStorage(() => uiPrefsStorage()),
      version: 2,
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...sanitizePersistedPrefs(persistedState),
      }),
    },
  ),
);

const memoryPrefsStorage = new Map<string, string>();

function uiPrefsStorage(): StateStorage {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    // Some test/webview environments expose `window` but disable localStorage.
  }
  return {
    getItem: (name) => memoryPrefsStorage.get(name) ?? null,
    setItem: (name, value) => {
      memoryPrefsStorage.set(name, value);
    },
    removeItem: (name) => {
      memoryPrefsStorage.delete(name);
    },
  };
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme !== "system") return theme;
  return prefersLightSystemTheme() ? "light" : "midnight";
}

export function applyThemeAttribute(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved = resolveTheme(theme);
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-theme-preference", theme);
  root.classList.toggle("dark", resolved === "midnight" || resolved === "eclipse");
  root.style.colorScheme = resolved === "light" || resolved === "paper" ? "light" : "dark";
}

/** Keep a System preference in sync after the browser/OS changes schemes. */
export function subscribeToSystemTheme(): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }

  const media = window.matchMedia("(prefers-color-scheme: light)");
  const handleChange = () => {
    if (useUiPrefs.getState().theme === "system") applyThemeAttribute("system");
  };

  if (useUiPrefs.getState().theme === "system") applyThemeAttribute("system");

  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }

  if (typeof media.addListener === "function") {
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }

  return () => undefined;
}

function prefersLightSystemTheme(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
      : false;
  } catch {
    return false;
  }
}

export function applyDensityAttribute(density: Density): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-density", density);
}
