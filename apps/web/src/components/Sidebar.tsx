import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Archive,
  Calendar,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  Filter,
  History,
  Inbox,
  ListChecks,
  Mail,
  MessageSquareReply,
  Package,
  Search,
  Send,
  Settings,
  Shield,
  Sparkles,
  Star,
  Trash2,
  UserCog,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { AccountSwitcher } from "@/components/AccountSwitcher";
import { ThemePicker } from "@/components/ThemePicker";
import { ConnectionPill } from "@/components/ConnectionPill";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  MailDropTarget,
  resolveSidebarDropTarget,
  type MailDropTarget as MailDropTargetData,
} from "@/features/mailbox/MailDndContext";
import { useShellQuery } from "@/features/mailbox/useMailboxQuery";
import type { SidebarItem } from "@/features/mailbox/types";
import { buildMailMailboxPath, parseMailLocation } from "@/features/mailbox/location";
import { cn } from "@/lib/utils";
import { isShortcutSuppressed } from "@/lib/keybindings";
import { useMailboxPane } from "@/state/mailboxPaneStore";
import {
  DEFAULT_SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  useUiPrefs,
  type SidebarFeature,
} from "@/state/uiPrefsStore";

interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  feature?: SidebarFeature;
  badge?: string | number;
  shortcut?: string;
  dropTarget?: MailDropTargetData;
}

const primary: NavItem[] = [
  { to: "/m/inbox", label: "Mail", Icon: Mail, shortcut: "1" },
  { to: "/drafts", label: "Drafts", Icon: FileText, feature: "drafts" },
  { to: "/search", label: "Search", Icon: Search, shortcut: "2", feature: "search" },
  {
    to: "/analytics",
    label: "Analytics",
    Icon: Activity,
    shortcut: "3",
    feature: "analytics",
  },
  { to: "/rules", label: "Rules", Icon: Filter, shortcut: "4", feature: "rules" },
  { to: "/screener", label: "Screener", Icon: Shield, shortcut: "5", feature: "screener" },
  {
    to: "/subscriptions",
    label: "Subscriptions",
    Icon: Sparkles,
    shortcut: "6",
    feature: "subscriptions",
  },
  {
    to: "/reply-queue",
    label: "Reply queue",
    Icon: MessageSquareReply,
    shortcut: "7",
    feature: "reply-queue",
  },
  {
    to: "/invites",
    label: "Calendar invites",
    Icon: Calendar,
    feature: "invites",
  },
  { to: "/deliveries", label: "Deliveries", Icon: Package, feature: "deliveries" },
  { to: "/accounts", label: "Accounts", Icon: UserCog, shortcut: "8", feature: "accounts" },
];

const fallbackLenses: NavItem[] = [
  { to: "/m/inbox", label: "Inbox", Icon: Inbox },
  { to: "/m/starred", label: "Starred", Icon: Star },
  { to: "/m/snoozed", label: "Snoozed", Icon: Sparkles },
  { to: "/m/sent", label: "Sent", Icon: Send },
  {
    to: "/m/archive",
    label: "Archive",
    Icon: Archive,
    dropTarget: {
      id: "system:archive:fallback",
      label: "Archive",
      kind: "system",
      action: "archive",
    },
  },
  {
    to: "/m/trash",
    label: "Trash",
    Icon: Trash2,
    dropTarget: { id: "system:trash:fallback", label: "Trash", kind: "system", action: "trash" },
  },
];

const systemItems: NavItem[] = [
  { to: "/activity", label: "Activity log", Icon: History, feature: "activity" },
  { to: "/jobs", label: "Jobs", Icon: ListChecks, feature: "jobs" },
  {
    to: "/diagnostics",
    label: "Diagnostics",
    Icon: Activity,
    shortcut: "9",
    feature: "diagnostics",
  },
];

interface NavSection {
  label: string;
  items: NavItem[];
}

interface SidebarProps {
  /** Render as the expanded mobile sheet rather than the desktop rail. */
  mobile?: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ mobile = false, onNavigate }: SidebarProps = {}) {
  const sidebarCollapsed = useUiPrefs((s) => s.sidebarCollapsed);
  const sidebarWidth = useUiPrefs((s) => s.sidebarWidth);
  const sidebarVisibility = useUiPrefs((s) => s.sidebarVisibility);
  const collapsed = mobile ? false : sidebarCollapsed;
  const setCollapsed = useUiPrefs((s) => s.setSidebarCollapsed);
  const setSidebarWidth = useUiPrefs((s) => s.setSidebarWidth);
  const resetSidebarWidth = () => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const shell = useShellQuery();
  const dynamicSections = shell.data?.sidebar?.sections;
  const accountKey = parseMailLocation(path)?.accountKey ?? "all";
  const activePane = useMailboxPane((state) => state.activePane);
  const setActivePane = useMailboxPane((state) => state.setActivePane);
  const sidebarIndex = useMailboxPane((state) => state.sidebarIndex);
  const setSidebarIndex = useMailboxPane((state) => state.setSidebarIndex);
  const sections = useMemo<NavSection[]>(() => {
    const visiblePrimary = primary.filter(
      (item) => item.feature === undefined || sidebarVisibility[item.feature],
    );
    const visibleSystem = systemItems.filter(
      (item) => item.feature === undefined || sidebarVisibility[item.feature],
    );
    const lensSections =
      dynamicSections && dynamicSections.length > 0
        ? dynamicSections.map((section) => ({
            label: section.title,
            items: section.items.map((item) => ({
              to: sidebarItemPath(item, accountKey),
              label: item.label,
              Icon: iconForSidebarItem(item),
              badge: item.unread && item.unread > 0 ? item.unread : undefined,
              dropTarget: resolveSidebarDropTarget(item),
            })),
          }))
        : [{ label: "Lenses", items: scopedMailItems(fallbackLenses, accountKey) }];
    const visibleSections = [
      { label: "Workspace", items: scopedMailItems(visiblePrimary, accountKey) },
      ...lensSections,
      { label: "System", items: visibleSystem },
    ];
    return visibleSections.filter((section) => section.items.length > 0);
  }, [accountKey, dynamicSections, sidebarVisibility]);
  const navigationItems = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  useEffect(() => {
    const activeIndex = navigationItems.findIndex((item) => isItemActive(path, item.to));
    if (activeIndex >= 0 && activePane !== "sidebar" && sidebarIndex !== activeIndex) {
      setSidebarIndex(activeIndex);
    }
  }, [activePane, navigationItems, path, setSidebarIndex, sidebarIndex]);

  useEffect(() => {
    if (navigationItems.length === 0 || sidebarIndex < navigationItems.length) return;
    setSidebarIndex(navigationItems.length - 1);
  }, [navigationItems.length, setSidebarIndex, sidebarIndex]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (activePane !== "sidebar") return;
      if (event.defaultPrevented) return;
      if (isShortcutSuppressed(event)) return;
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        setSidebarIndex(Math.min(navigationItems.length - 1, sidebarIndex + 1));
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        setSidebarIndex(Math.max(0, sidebarIndex - 1));
      } else if (
        event.key === "l" ||
        event.key === "ArrowRight" ||
        event.key === "Enter" ||
        event.key === "o"
      ) {
        event.preventDefault();
        const item = navigationItems[sidebarIndex];
        if (item) {
          onNavigate?.();
          void navigate({ to: item.to });
          setActivePane("mailbox");
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activePane,
    navigate,
    navigationItems,
    onNavigate,
    setActivePane,
    setSidebarIndex,
    sidebarIndex,
  ]);

  let itemIndex = 0;

  return (
    <aside
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground"
      data-mobile-navigation={mobile ? "true" : undefined}
      aria-label="Mailbox sidebar"
    >
      <div className={cn("border-b border-sidebar-border p-2", mobile && "pr-14")}>
        <AccountSwitcher collapsed={collapsed} />
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 py-3">
          {sections.map((section, sectionIndex) => (
            <SidebarSection
              key={section.label}
              label={section.label}
              collapsed={collapsed}
              mobile={mobile}
              className={sectionIndex > 0 ? "mt-4" : undefined}
            >
              {section.items.map((item) => {
                const index = itemIndex;
                itemIndex += 1;
                return (
                  <SidebarLink
                    key={`${section.label}-${item.to}-${item.label}`}
                    item={item}
                    collapsed={collapsed}
                    mobile={mobile}
                    active={isItemActive(path, item.to)}
                    focused={activePane === "sidebar" && sidebarIndex === index}
                    onNavigate={onNavigate}
                    onFocusPane={() => {
                      setSidebarIndex(index);
                      setActivePane("sidebar");
                    }}
                  />
                );
              })}
            </SidebarSection>
          ))}
        </div>
      </ScrollArea>

      <div
        className={cn(
          "border-t border-sidebar-border px-2 py-2",
          collapsed ? "flex flex-col items-center gap-1" : "flex items-center gap-1",
          mobile && "pb-[max(0.5rem,env(safe-area-inset-bottom))]",
        )}
      >
        <SidebarSettingsButton
          onClick={() => {
            onNavigate?.();
            void navigate({ to: "/settings/$section", params: { section: "theme" } });
          }}
        />
        <ConnectionPill compact className="size-9 shrink-0" />
        {!collapsed ? <ThemePicker /> : null}
        {!mobile ? (
          <SidebarCollapseButton collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        ) : null}
      </div>
      {!mobile && !collapsed ? (
        <SidebarResizeHandle
          width={sidebarWidth}
          onChange={setSidebarWidth}
          onReset={resetSidebarWidth}
        />
      ) : null}
    </aside>
  );
}

const SIDEBAR_RESIZE_KEYBOARD_STEP = 16;

function SidebarSettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9"
          aria-label="Settings"
          title="Settings"
          onClick={onClick}
        >
          <Settings className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">Settings</TooltipContent>
    </Tooltip>
  );
}

function SidebarCollapseButton({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronsRight className="size-3.5" />
          ) : (
            <ChevronsLeft className="size-3.5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{collapsed ? "Expand" : "Collapse"}</TooltipContent>
    </Tooltip>
  );
}

interface SidebarResizeHandleProps {
  width: number;
  onChange: (width: number) => void;
  onReset: () => void;
}

function SidebarResizeHandle({ width, onChange, onReset }: SidebarResizeHandleProps) {
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  function endPointerResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (
      typeof event.currentTarget.hasPointerCapture === "function" &&
      event.currentTarget.hasPointerCapture(event.pointerId) &&
      typeof event.currentTarget.releasePointerCapture === "function"
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drag.current = null;
  }

  return (
    <button
      type="button"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={SIDEBAR_WIDTH_MIN}
      aria-valuemax={SIDEBAR_WIDTH_MAX}
      aria-valuenow={width}
      aria-valuetext={`${width} pixels`}
      tabIndex={0}
      data-testid="sidebar-resize-handle"
      className="absolute inset-y-0 right-0 z-20 flex w-2 cursor-col-resize touch-none items-center justify-center border-0 bg-transparent p-0 outline-none transition-colors hover:bg-sidebar-primary/20 focus-visible:bg-sidebar-primary/30"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startWidth: width,
        };
        if (typeof event.currentTarget.setPointerCapture === "function") {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        event.preventDefault();
        onChange(current.startWidth + event.clientX - current.startX);
      }}
      onPointerUp={endPointerResize}
      onPointerCancel={endPointerResize}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onChange(width - SIDEBAR_RESIZE_KEYBOARD_STEP);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onChange(width + SIDEBAR_RESIZE_KEYBOARD_STEP);
        } else if (event.key === "Home") {
          event.preventDefault();
          onChange(SIDEBAR_WIDTH_MIN);
        } else if (event.key === "End") {
          event.preventDefault();
          onChange(SIDEBAR_WIDTH_MAX);
        }
      }}
      onDoubleClick={onReset}
    >
      <span className="h-full w-px bg-sidebar-border" aria-hidden="true" />
    </button>
  );
}

interface SectionProps {
  label: string;
  collapsed: boolean;
  mobile: boolean;
  className?: string;
  children: ReactNode;
}

function SidebarSection({ label, collapsed, mobile, className, children }: SectionProps) {
  return (
    <div className={className}>
      {!collapsed && (
        <div
          className={cn(
            "mb-1 px-2 text-2xs font-semibold uppercase tracking-wide text-sidebar-foreground/60",
            mobile && "mt-1",
          )}
        >
          {label}
        </div>
      )}
      <nav className="flex flex-col gap-0.5">{children}</nav>
    </div>
  );
}

interface LinkProps {
  item: NavItem;
  collapsed: boolean;
  mobile: boolean;
  active: boolean;
  focused: boolean;
  onNavigate?: () => void;
  onFocusPane: () => void;
}

function SidebarLink({
  item,
  collapsed,
  mobile,
  active,
  focused,
  onNavigate,
  onFocusPane,
}: LinkProps) {
  const inner = (
    <Link
      to={item.to}
      data-focused={focused ? "true" : undefined}
      onFocus={onFocusPane}
      aria-current={active ? "page" : undefined}
      onClick={() => onNavigate?.()}
      className={cn(
        "group flex items-center gap-2 rounded-md",
        mobile
          ? "min-h-10 px-3 py-2 text-sm"
          : collapsed
            ? "size-10 justify-center p-0 text-xs"
            : "px-2 py-1.5 text-xs",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        focused && "outline outline-1 outline-sidebar-ring/80",
      )}
    >
      <item.Icon className={cn("size-3.5 shrink-0", active && "text-sidebar-primary")} />
      {!collapsed && (
        <span className={cn("flex-1 truncate", active && "font-semibold")}>{item.label}</span>
      )}
      {!collapsed && item.badge !== undefined ? (
        <span
          className={cn(
            "font-mono text-2xs",
            active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/60",
          )}
        >
          {item.badge}
        </span>
      ) : null}
      {!collapsed && item.shortcut ? (
        <kbd className="rounded border border-sidebar-border bg-sidebar-accent px-1.5 py-0.5 font-mono text-2xs text-sidebar-foreground/60">
          {item.shortcut}
        </kbd>
      ) : null}
    </Link>
  );
  const content = item.dropTarget ? (
    <MailDropTarget target={item.dropTarget}>{inner}</MailDropTarget>
  ) : (
    inner
  );
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }
  return content;
}

function isItemActive(path: string, to: string): boolean {
  if (to === "/m/inbox") return path === to || path.startsWith(`${to}/`);
  return path === to || path.startsWith(`${to}/`);
}

function scopedMailItems(items: NavItem[], accountKey: string): NavItem[] {
  return items.map((item) => {
    if (!item.to.startsWith("/m/")) return item;
    const mailbox = item.to.slice("/m/".length);
    const lens = mailbox === "inbox" ? { kind: "inbox" as const } : mailbox === "archive" ? { kind: "archive" as const } : { kind: "label" as const, labelId: mailbox };
    return { ...item, to: buildMailMailboxPath({ accountKey, lens }) };
  });
}

function sidebarItemPath(item: SidebarItem, accountKey: string): string {
  const lens = item.lens;
  if (!lens || lens.kind === "inbox") {
    return buildMailMailboxPath({ accountKey, lens: { kind: "inbox" } });
  }
  if (lens.kind === "all_mail") {
    return buildMailMailboxPath({ accountKey, lens: { kind: "archive" } });
  }
  if (lens.kind === "saved_search") {
    return buildMailMailboxPath({
      accountKey,
      lens: { kind: "saved", slug: item.id.replace(/^saved-search-/, "") },
    });
  }
  if (lens.kind === "label") {
    return buildMailMailboxPath({ accountKey, lens: { kind: "label", labelId: lens.labelId ?? item.id } });
  }
  if (lens.kind === "subscription") {
    return buildMailMailboxPath({ accountKey, lens: { kind: "label", labelId: item.id } });
  }
  return buildMailMailboxPath({ accountKey, lens: { kind: "inbox" } });
}

function iconForSidebarItem(item: SidebarItem): NavItem["Icon"] {
  const label = item.label.toLowerCase();
  if (label.includes("inbox")) return Inbox;
  if (label.includes("star")) return Star;
  if (label.includes("sent")) return Send;
  if (label.includes("draft")) return Mail;
  if (label.includes("spam")) return Shield;
  if (label.includes("trash")) return Trash2;
  if (label.includes("archive") || label.includes("all mail")) return Archive;
  if (label.includes("subscription")) return Sparkles;
  return Mail;
}
