/*
 * Global UI prefs — theme, density, sidebar collapsed state, compose editor
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
export type ToastCategory = "errors" | "success" | "info" | "undo" | "sent";
export type ToastPreferences = Record<ToastCategory, boolean>;
/** Undo-send window in seconds; 0 sends immediately. */
export type UndoSendSeconds = 0 | 5 | 10 | 30;

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

export interface UiPrefsState {
  theme: Theme;
  density: Density;
  sidebarCollapsed: boolean;
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
