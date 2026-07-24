"use client";

import { AnimatePresence, motion, type Transition } from "framer-motion";
import {
  ArrowLeft,
  BarChart3,
  Home,
  LoaderCircle,
  LogOut,
  Plus,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { authClient } from "../../lib/auth-client";
import { ProfileAvatar } from "./profile-avatar";

export type AppNavItem =
  | "Home"
  | "Chat"
  | "Transactions"
  | "Analytics"
  | "Budget"
  | "Family"
  | "Profile";

type ChatSessionSummary = {
  id: string;
  title: string;
  titleStatus: "generated" | "fallback";
  titleModel?: string | null;
  messageCount: number;
  lastMessageAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ChatSessionsApiResponse = {
  ok: boolean;
  data?: {
    sessions: ChatSessionSummary[];
  };
  error?: {
    code: string;
    message: string;
  };
};

const mobileNavAccentByLabel = {
  Home: "from-[#fff7d6] via-[#f1f7df] to-[#ddf1ea] text-primary",
  Transactions: "from-[#e6f4ef] via-[#edf7ef] to-[#fff3d8] text-success",
  Analytics: "from-[#e7f0ff] via-[#edf7ef] to-[#fff6dc] text-info",
  Profile: "from-[#fff1df] via-[#f6f1df] to-[#e8f3ea] text-primary",
} satisfies Partial<Record<AppNavItem, string>>;

type AppMeResponse = {
  user?: {
    id?: string;
    name?: string;
    email?: string;
    userProfile?: string | null;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

const navItems: Array<{ label: AppNavItem; href: string }> = [
  { label: "Home", href: "/home" },
  { label: "Transactions", href: "/transactions" },
  { label: "Analytics", href: "/analytics" },
  { label: "Budget", href: "/budget" },
  { label: "Family", href: "/settings/family" },
];

type MobileNavItem = {
  label: AppNavItem;
  href: string;
  Icon?: typeof Home;
};

const mobileNavItems: MobileNavItem[] = [
  { label: "Home", href: "/home", Icon: Home },
  { label: "Transactions", href: "/transactions", Icon: Wallet },
  { label: "Analytics", href: "/analytics", Icon: BarChart3 },
  { label: "Profile", href: "/profile" },
];

const drawerSpring: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 38,
  mass: 0.85,
};

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block rounded-md bg-surface-muted motion-safe:animate-pulse ${className}`}
    />
  );
}

function ChatHistorySkeleton() {
  return (
    <div className="grid gap-1" aria-busy="true" aria-label="Loading chats">
      <p className="sr-only">Loading chats</p>
      {["w-10/12", "w-8/12", "w-11/12", "w-7/12"].map((widthClass, index) => (
        <div key={`${widthClass}-${index}`} className="rounded-md px-3 py-2">
          <SkeletonBlock className={`h-4 ${widthClass}`} />
        </div>
      ))}
    </div>
  );
}

function getApiErrorCode(body: unknown, fallback: string) {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object" &&
    "code" in body.error &&
    typeof body.error.code === "string"
  ) {
    return body.error.code;
  }

  return fallback;
}

export function AppSideNavigation({
  activeItem,
  activeSessionId,
  isOpen,
  loadingSessionId,
  onClose,
  onNewChat,
  onSelectChatSession,
}: {
  activeItem: AppNavItem;
  activeSessionId?: string | null;
  isOpen: boolean;
  loadingSessionId?: string | null;
  onClose: () => void;
  onNewChat?: () => void;
  onSelectChatSession?: (sessionId: string) => void;
}) {
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [profileLabel, setProfileLabel] = useState("Profile");
  const [profileSubLabel, setProfileSubLabel] = useState("Account");
  const [profileImage, setProfileImage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadProfileSummary() {
      try {
        const meResponse = await fetch("/api/app/me", { cache: "no-store" });
        const meBody = (await meResponse
          .json()
          .catch(() => null)) as AppMeResponse | null;

        if (!meResponse.ok || !meBody?.user?.id || !isMounted) {
          return;
        }

        setProfileLabel(meBody.user.name ?? meBody.user.email ?? "Profile");
        setProfileSubLabel(meBody.user.email ?? "Account");
        setProfileImage(meBody.user.userProfile ?? null);
      } catch {
        // The page-level auth flow handles unauthorized or unavailable sessions.
      }
    }

    void loadProfileSummary();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isMounted = true;

    async function loadSessions() {
      setIsLoadingSessions(true);
      setHistoryError("");

      try {
        const meResponse = await fetch("/api/app/me", { cache: "no-store" });
        const meBody = (await meResponse
          .json()
          .catch(() => null)) as AppMeResponse | null;

        if (!meResponse.ok || !meBody?.user?.id) {
          throw new Error(getApiErrorCode(meBody, "unauthorized"));
        }

        if (isMounted) {
          setProfileLabel(meBody.user.name ?? meBody.user.email ?? "Profile");
          setProfileSubLabel(meBody.user.email ?? "Account");
          setProfileImage(meBody.user.userProfile ?? null);
        }

        const sessionsResponse = await fetch("/api/chat/sessions", {
          cache: "no-store",
        });
        const sessionsBody = (await sessionsResponse
          .json()
          .catch(() => null)) as ChatSessionsApiResponse | null;

        if (
          !sessionsResponse.ok ||
          !sessionsBody?.ok ||
          !sessionsBody.data?.sessions
        ) {
          throw new Error("chat_session_failed");
        }

        if (isMounted) {
          setChatSessions(sessionsBody.data.sessions);
        }
      } catch (error) {
        if (isMounted) {
          setChatSessions([]);
          setHistoryError("Recent chats could not load.");

          if (error instanceof Error && error.message === "unauthorized") {
            window.location.assign(
              `/login?next=${encodeURIComponent(window.location.pathname)}`,
            );
          }
        }
      } finally {
        if (isMounted) {
          setIsLoadingSessions(false);
        }
      }
    }

    void loadSessions();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  async function handleLogout() {
    setIsSigningOut(true);
    setLogoutError("");

    try {
      const { error } = await authClient.signOut();

      if (error) {
        throw new Error(error.code ?? error.message ?? "Could not sign out.");
      }

      window.location.assign("/login");
    } catch (error) {
      setIsSigningOut(false);
      setLogoutError(
        error instanceof Error ? error.message : "Could not sign out.",
      );
    }
  }

  function handleChatSessionClick(sessionId: string) {
    if (onSelectChatSession) {
      onSelectChatSession(sessionId);
      return;
    }

    window.location.assign(`/chat?sessionId=${encodeURIComponent(sessionId)}`);
  }

  function handleNewChat() {
    if (onNewChat) {
      onNewChat();
      return;
    }

    window.location.assign("/chat");
  }

  function renderMobileNavItem({ label, href, Icon }: MobileNavItem) {
    const isActive = activeItem === label;
    const isProfileItem = label === "Profile";
    const accentClass =
      mobileNavAccentByLabel[label] ?? mobileNavAccentByLabel.Home;

    return (
      <motion.a
        key={label}
        className="group relative grid h-12 place-items-center rounded-2xl outline-none transition focus-visible:ring-2 focus-visible:ring-primary/25"
        href={href}
        aria-label={label}
        aria-current={isActive ? "page" : undefined}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: "spring", stiffness: 480, damping: 28 }}
      >
        <motion.span
          className={`relative grid size-11 place-items-center overflow-hidden rounded-[1.25rem] border transition ${
            isActive
              ? `border-white/70 bg-linear-to-br ${accentClass} shadow-[0_6px_16px_rgba(36,92,87,0.12),inset_0_1px_0_rgba(255,255,255,0.82)]`
              : "border-border/60 bg-background/70 text-text-soft shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] group-hover:border-primary/20 group-hover:bg-surface group-hover:text-primary"
          }`}
          animate={
            isActive
              ? { y: -2, scale: 1.04, rotate: isProfileItem ? 0 : -1 }
              : { y: 0, scale: 1, rotate: 0 }
          }
          transition={{ type: "spring", stiffness: 440, damping: 30 }}
        >
          {isActive ? (
            <motion.span
              className="absolute inset-1 rounded-2xl bg-white/30"
              layoutId="mobile-nav-active-wash"
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
            />
          ) : null}
          <motion.span
            className="absolute -right-1 -top-1 size-4 rounded-full bg-primary/10 opacity-0 transition group-hover:opacity-100"
            animate={isActive ? { opacity: 1, scale: [0.9, 1.08, 0.96] } : {}}
            transition={isActive ? { duration: 1.8, repeat: Infinity } : {}}
          />
          {isProfileItem ? (
            <ProfileAvatar
              label={profileLabel}
              userProfile={profileImage}
              className="relative z-10 size-11 rounded-[1.25rem] border-0"
              initialClassName="text-sm"
            />
          ) : Icon ? (
            <Icon
              className="relative size-5"
              strokeWidth={isActive ? 2.15 : 1.85}
              aria-hidden="true"
            />
          ) : null}
        </motion.span>
      </motion.a>
    );
  }

  return (
    <>
      <AnimatePresence>
        {activeItem !== "Chat" ? (
          <motion.nav
            className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:hidden"
            aria-label="Bottom navigation"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="mx-auto grid h-16 max-w-sm grid-cols-5 items-center rounded-[1.75rem] border border-border/80 bg-surface/95 px-3 shadow-[0_10px_28px_rgba(15,23,42,0.09)] backdrop-blur">
              {mobileNavItems.slice(0, 2).map(renderMobileNavItem)}

              <motion.button
                className="mx-auto -mt-7 grid size-14 place-items-center rounded-full border-[5px] border-background bg-[radial-gradient(circle_at_30%_20%,#75d380,#245c57_62%)] text-white shadow-[0_8px_20px_rgba(36,92,87,0.14),inset_0_1px_0_rgba(255,255,255,0.42)] transition hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                type="button"
                aria-label="New chat"
                onClick={handleNewChat}
                whileHover={{ y: -3, rotate: -2 }}
                whileTap={{ scale: 0.92 }}
                transition={{ type: "spring", stiffness: 460, damping: 28 }}
              >
                <span className="relative grid size-9 place-items-center">
                  <Sparkles
                    className="size-6 drop-shadow-sm"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-surface text-primary ring-2 ring-primary">
                    <Plus
                      className="size-2.5"
                      strokeWidth={2.2}
                      aria-hidden="true"
                    />
                  </span>
                </span>
              </motion.button>

              {mobileNavItems.slice(2).map(renderMobileNavItem)}
            </div>
          </motion.nav>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="fixed inset-0 z-50 hidden lg:block"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation and chat history"
            id="app-navigation"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1 }}
          >
            <motion.button
              className="absolute inset-0 bg-slate-950/25"
              type="button"
              aria-label="Close navigation"
              onClick={onClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            />
            <motion.aside
              className="relative flex h-full w-[min(20rem,calc(100vw-2rem))] flex-col border-r border-border bg-background px-3 py-4 shadow-xl"
              initial={{ x: -28, opacity: 0.88 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -24, opacity: 0 }}
              transition={drawerSpring}
            >
              <div className="mb-4 flex items-center justify-between px-2">
                <motion.a
                  href="/chat"
                  className="flex items-center gap-2 rounded-md text-sm font-semibold text-text"
                  onClick={onClose}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08, duration: 0.18, ease: "easeOut" }}
                >
                  <span className="grid size-8 place-items-center rounded-md border border-border bg-surface text-sm font-bold">
                    C
                  </span>
                  Cocobaa
                </motion.a>
                <motion.button
                  className="grid size-9 place-items-center rounded-md border border-border bg-surface text-sm font-semibold text-text-muted transition hover:text-text"
                  type="button"
                  aria-label="Close navigation"
                  onClick={onClose}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.96 }}
                >
                  <ArrowLeft
                    className="size-5"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </motion.button>
              </div>

              <nav aria-label="Main navigation" className="mb-5 grid gap-1">
                {navItems.map((item, index) => (
                  <motion.a
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      delay: 0.1 + index * 0.025,
                      duration: 0.16,
                      ease: "easeOut",
                    }}
                    whileHover={{ x: 2 }}
                    whileTap={{ scale: 0.98 }}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                      item.label === activeItem
                        ? "bg-surface text-text shadow-sm"
                        : "text-text-muted hover:bg-surface hover:text-text"
                    }`}
                  >
                    {item.label}
                  </motion.a>
                ))}
              </nav>

              {activeItem === "Chat" ? (
                <>
                  <motion.button
                    className="mb-5 flex w-full items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-left text-sm font-semibold text-text transition hover:bg-surface-muted"
                    type="button"
                    onClick={handleNewChat}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.14,
                      duration: 0.18,
                      ease: "easeOut",
                    }}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Plus
                      className="size-4 text-text-muted"
                      strokeWidth={1.9}
                      aria-hidden="true"
                    />
                    New chat
                  </motion.button>

                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <motion.section
                      className="mb-5"
                      aria-labelledby="recent-app-history"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: 0.18,
                        duration: 0.18,
                        ease: "easeOut",
                      }}
                    >
                      <h2
                        id="recent-app-history"
                        className="mb-2 px-3 text-xs font-semibold uppercase text-text-soft"
                      >
                        Recent
                      </h2>
                      <div className="grid gap-1">
                        {isLoadingSessions ? <ChatHistorySkeleton /> : null}
                        {!isLoadingSessions && historyError ? (
                          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
                            {historyError}
                          </p>
                        ) : null}
                        {!isLoadingSessions &&
                        !historyError &&
                        chatSessions.length === 0 ? (
                          <p className="rounded-md px-3 py-2 text-sm text-text-soft">
                            No chats yet
                          </p>
                        ) : null}
                        {chatSessions.map((chatSession) => {
                          const isActive = chatSession.id === activeSessionId;
                          const isLoading = loadingSessionId === chatSession.id;

                          return (
                            <motion.button
                              key={chatSession.id}
                              type="button"
                              onClick={() =>
                                handleChatSessionClick(chatSession.id)
                              }
                              disabled={Boolean(loadingSessionId)}
                              whileHover={{ x: 2 }}
                              whileTap={{ scale: 0.98 }}
                              className={`flex min-w-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                isActive
                                  ? "bg-surface text-text shadow-sm"
                                  : "text-text-muted hover:bg-surface hover:text-text"
                              }`}
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {chatSession.title}
                              </span>
                              {isLoading ? (
                                <LoaderCircle
                                  className="size-3.5 shrink-0 animate-spin text-text-soft"
                                  strokeWidth={1.9}
                                  aria-hidden="true"
                                />
                              ) : null}
                            </motion.button>
                          );
                        })}
                      </div>
                    </motion.section>
                  </div>
                </>
              ) : (
                <div className="flex-1" />
              )}

              <motion.div
                className="mt-4 border-t border-border pt-3"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28, duration: 0.18, ease: "easeOut" }}
              >
                <div className="flex items-center gap-2">
                  <a
                    href="/profile"
                    className={`flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 transition ${
                      activeItem === "Profile"
                        ? "bg-surface"
                        : "hover:bg-surface"
                    }`}
                    onClick={onClose}
                  >
                    <ProfileAvatar
                      label={profileLabel}
                      userProfile={profileImage}
                      className="size-10 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-text">
                        {profileLabel}
                      </span>
                      <span className="block truncate text-xs text-text-soft">
                        {profileSubLabel}
                      </span>
                    </span>
                  </a>
                  <button
                    className="grid size-10 shrink-0 place-items-center rounded-md text-text-muted transition hover:bg-surface hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={handleLogout}
                    disabled={isSigningOut}
                    aria-label={isSigningOut ? "Signing out" : "Sign out"}
                    title={isSigningOut ? "Signing out" : "Sign out"}
                  >
                    {isSigningOut ? (
                      <LoaderCircle
                        className="size-4 animate-spin"
                        strokeWidth={1.9}
                        aria-hidden="true"
                      />
                    ) : (
                      <LogOut
                        className="size-4"
                        strokeWidth={1.9}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </div>
                {logoutError ? (
                  <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-danger">
                    {logoutError}
                  </p>
                ) : null}
              </motion.div>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
