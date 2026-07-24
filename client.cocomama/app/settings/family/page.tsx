"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  Copy,
  Edit3,
  Hash,
  Link2,
  LoaderCircle,
  Menu,
  QrCode,
  Trash2,
  UserRound,
  UserRoundPlus,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { AppSideNavigation } from "../../components/app-side-navigation";

type Relationship = (typeof relationshipOptions)[number];
type InviteMethod = "link" | "qr" | "code";

type FamilyMember = {
  id: string;
  userId: string | null;
  name: string;
  accountName: string;
  relationship: Relationship;
  role: string;
  isPlaceholder: boolean;
  isCurrentUser?: boolean;
};

type FamilyState = {
  household: {
    id: string;
    name: string;
    usedSeats: number;
    canManage: boolean;
  };
  members: FamilyMember[];
  invites: Array<{
    id: string;
    role: string;
    expiresAt: string;
    createdAt: string;
  }>;
};

type FamilyInvite = {
  id: string;
  inviteCode: string;
  inviteUrl: string;
  qrValue: string;
  expiresAt: string;
};

type FamilyInviteResponse = {
  invite: FamilyInvite;
  family: FamilyState;
};

type FamilyInviteAcceptResponse = {
  status: "joined" | "already_member";
  householdId: string;
  family: FamilyState;
};

const relationshipOptions = [
  "Father",
  "Mother",
  "Partner",
  "Child",
  "Dependent",
  "Grandparent",
  "Sibling",
  "Housemate",
  "Other",
] as const;

const inviteMethods: Record<
  InviteMethod,
  {
    label: string;
    Icon: typeof Link2;
  }
> = {
  link: {
    label: "Invite link",
    Icon: Link2,
  },
  qr: {
    label: "QR code",
    Icon: QrCode,
  },
  code: {
    label: "Invite code",
    Icon: Hash,
  },
};

function MemberAvatar({ muted = false }: { muted?: boolean }) {
  return (
    <div
      className={`grid size-12 shrink-0 place-items-center rounded-full border ${
        muted
          ? "border-border bg-background text-text-soft"
          : "border-border bg-surface-muted text-text-muted"
      }`}
      aria-hidden="true"
    >
      <UserRound className="size-6" strokeWidth={1.8} />
    </div>
  );
}

function FamilyMemberRow({
  member,
  index,
}: {
  member: FamilyMember;
  index: number;
}) {
  return (
    <motion.li
      className="flex items-center gap-3 px-1 py-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 + index * 0.025, duration: 0.18 }}
    >
      <MemberAvatar />
      <span className="min-w-0 truncate text-base font-semibold text-text">
        {member.name}
      </span>
    </motion.li>
  );
}

function EditableMemberRow({
  member,
  isOpen,
  isSaving,
  onToggle,
  onRelationshipChange,
  onRemove,
}: {
  member: FamilyMember;
  isOpen: boolean;
  isSaving: boolean;
  onToggle: () => void;
  onRelationshipChange: (relationship: Relationship) => void;
  onRemove: () => void;
}) {
  return (
    <motion.article
      layout
      className="rounded-lg border border-border bg-surface px-3 py-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div className="flex items-center gap-3">
        <MemberAvatar />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-text">
            {member.name}
          </h2>
          <p className="mt-0.5 truncate text-sm text-text-soft">
            {member.relationship} in household
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <motion.button
            className="grid size-10 place-items-center rounded-full text-text-muted transition hover:bg-surface-muted hover:text-text"
            type="button"
            aria-label={`Edit ${member.name}`}
            aria-expanded={isOpen}
            onClick={onToggle}
            disabled={isSaving}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.95 }}
          >
            <Edit3 className="size-4" strokeWidth={1.9} aria-hidden="true" />
          </motion.button>
          {!member.isCurrentUser ? (
            <motion.button
              className="grid size-10 place-items-center rounded-full text-text-muted transition hover:bg-red-50 hover:text-danger"
              type="button"
              aria-label={`Remove ${member.name}`}
              onClick={onRemove}
              disabled={isSaving}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.95 }}
            >
              <Trash2 className="size-4" strokeWidth={1.9} aria-hidden="true" />
            </motion.button>
          ) : null}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            className="mt-4 grid gap-3 border-t border-border pt-4"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="grid gap-1">
              <p className="text-xs font-semibold uppercase text-text-soft">
                Account name
              </p>
              <p className="truncate text-sm font-medium text-text">
                {member.accountName}
              </p>
            </div>
            <label className="grid gap-1 text-xs font-semibold uppercase text-text-soft">
              Relationship in household
              <select
                className="h-11 rounded-md border border-border bg-background px-3 text-sm font-medium normal-case text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                value={member.relationship}
                disabled={isSaving}
                onChange={(event) =>
                  onRelationshipChange(event.target.value as Relationship)
                }
              >
                {relationshipOptions.map((relationship) => (
                  <option key={relationship}>{relationship}</option>
                ))}
              </select>
            </label>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}

function FamilyActionCard({
  title,
  subtext,
  Icon,
  isSelected,
  onClick,
}: {
  title: string;
  subtext: string;
  Icon: typeof Edit3;
  isSelected?: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      layout
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition ${
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border bg-surface hover:border-primary"
      }`}
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <span
        className="grid size-12 shrink-0 place-items-center rounded-full border border-border bg-background text-text-soft"
        aria-hidden="true"
      >
        <Icon className="size-5" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold text-text">
          {title}
        </span>
        <span className="block truncate text-sm text-text-soft">{subtext}</span>
      </span>
    </motion.button>
  );
}

function InvitePanel({
  method,
  invite,
  isLoading,
  error,
  onMethodChange,
  onCopy,
}: {
  method: InviteMethod;
  invite: FamilyInvite | null;
  isLoading: boolean;
  error: string;
  onMethodChange: (method: InviteMethod) => void;
  onCopy: (value: string, label: string) => void;
}) {
  const activeMethod = inviteMethods[method];
  const activeValue =
    method === "code"
      ? invite?.inviteCode
      : method === "qr"
        ? invite?.qrValue
        : invite?.inviteUrl;

  return (
    <motion.section
      className="rounded-lg border border-border bg-surface p-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      aria-label="Invite options"
    >
      <div
        className="grid grid-cols-3 gap-2"
        role="tablist"
        aria-label="Invite method"
      >
        {(Object.keys(inviteMethods) as InviteMethod[]).map((currentMethod) => {
          const { Icon, label } = inviteMethods[currentMethod];
          const isActive = method === currentMethod;

          return (
            <motion.button
              key={currentMethod}
              className={`grid min-h-14 place-items-center gap-1 rounded-md border px-2 text-xs font-semibold transition ${
                isActive
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-background text-text-muted hover:border-primary hover:text-text"
              }`}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onMethodChange(currentMethod)}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
            >
              <Icon className="size-4" strokeWidth={1.9} aria-hidden="true" />
              {label}
            </motion.button>
          );
        })}
      </div>

      <div className="mt-3 rounded-md bg-background p-3">
        {isLoading ? (
          <div className="flex items-center gap-3 text-sm font-medium text-text-muted">
            <LoaderCircle
              className="size-4 animate-spin"
              strokeWidth={1.9}
              aria-hidden="true"
            />
            Creating secure invite
          </div>
        ) : error ? (
          <p className="text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        ) : method === "qr" ? (
          <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="mx-auto grid size-52 shrink-0 place-items-center rounded-lg border border-border bg-white p-4 sm:mx-0">
              {activeValue ? (
                <QRCodeSVG
                  value={activeValue}
                  size={176}
                  level="M"
                  marginSize={1}
                  bgColor="#ffffff"
                  fgColor="#171717"
                  title="Family invite QR code"
                />
              ) : (
                <QrCode
                  className="size-12 text-text-soft"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="min-w-0 text-center sm:text-left">
              <p className="text-sm font-semibold text-text">
                {activeValue ? "QR code ready" : "Invite not ready"}
              </p>
              <p className="mt-1 text-sm text-text-soft">
                Scan to join this household.
              </p>
              {activeValue ? (
                <button
                  className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-muted transition hover:border-primary hover:text-text"
                  type="button"
                  onClick={() => onCopy(activeValue, "QR invite link")}
                >
                  <Copy
                    className="size-4"
                    strokeWidth={1.9}
                    aria-hidden="true"
                  />
                  Copy QR link
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate font-mono text-sm text-text">
              {activeValue ?? "Invite not ready"}
            </p>
            <motion.button
              className="grid size-10 shrink-0 place-items-center rounded-md border border-border bg-surface text-text-muted transition hover:border-primary hover:text-text"
              type="button"
              aria-label={`Copy ${activeMethod.label.toLowerCase()}`}
              disabled={!activeValue}
              onClick={() =>
                activeValue && onCopy(activeValue, activeMethod.label)
              }
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.95 }}
            >
              <Copy className="size-4" strokeWidth={1.9} aria-hidden="true" />
            </motion.button>
          </div>
        )}
      </div>
    </motion.section>
  );
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

async function apiRequest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const errorCode =
      body && typeof body === "object" && "error" in body
        ? String(body.error)
        : "request_failed";

    throw new Error(errorCode.replaceAll("_", " "));
  }

  return body as T;
}

export default function FamilySettingsPage() {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [family, setFamily] = useState<FamilyState | null>(null);
  const [isLoadingFamily, setIsLoadingFamily] = useState(true);
  const [familyError, setFamilyError] = useState("");
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteMethod, setInviteMethod] = useState<InviteMethod>("link");
  const [activeInvite, setActiveInvite] = useState<FamilyInvite | null>(null);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState("");
  const statusTimeoutRef = useRef<number | null>(null);

  const members = family?.members ?? [];
  const householdName = family?.household.name ?? "Family household";
  const canManageFamily = family?.household.canManage ?? false;

  useEffect(() => {
    let isActive = true;

    async function loadFamily() {
      setIsLoadingFamily(true);
      setFamilyError("");

      try {
        const inviteToken = new URLSearchParams(window.location.search).get(
          "invite",
        );

        if (inviteToken) {
          const acceptedInvite = await apiRequest<FamilyInviteAcceptResponse>(
            "/api/app/family/invites/accept",
            {
              method: "POST",
              body: JSON.stringify({ token: inviteToken }),
            },
          );

          if (!isActive) {
            return;
          }

          setFamily(acceptedInvite.family);
          queueActionStatus(
            acceptedInvite.status === "joined"
              ? "You joined the household."
              : "You are already in this household.",
          );
          window.history.replaceState({}, "", window.location.pathname);
        } else {
          const nextFamily = await apiRequest<FamilyState>("/api/app/family");

          if (!isActive) {
            return;
          }

          setFamily(nextFamily);
        }
      } catch (error) {
        if (isActive) {
          setFamilyError(
            getApiErrorMessage(error, "Could not load family members."),
          );
        }
      } finally {
        if (isActive) {
          setIsLoadingFamily(false);
        }
      }
    }

    void loadFamily();

    return () => {
      isActive = false;

      if (statusTimeoutRef.current) {
        window.clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  function queueActionStatus(message: string) {
    setActionStatus(message);

    if (statusTimeoutRef.current) {
      window.clearTimeout(statusTimeoutRef.current);
    }

    statusTimeoutRef.current = window.setTimeout(() => {
      setActionStatus("");
      statusTimeoutRef.current = null;
    }, 2800);
  }

  async function handleCopy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      queueActionStatus(`${label} copied.`);
    } catch {
      queueActionStatus("Copy failed. Select the invite and copy it manually.");
    }
  }

  async function handleCreateInvite(method: InviteMethod) {
    setIsCreatingInvite(true);
    setInviteError("");

    try {
      const result = await apiRequest<FamilyInviteResponse>(
        "/api/app/family/invites",
        {
          method: "POST",
          body: JSON.stringify({ method }),
        },
      );

      setActiveInvite(result.invite);
      setFamily(result.family);
      queueActionStatus("Invite ready.");
    } catch (error) {
      setInviteError(getApiErrorMessage(error, "Could not create the invite."));
    } finally {
      setIsCreatingInvite(false);
    }
  }

  function handleInviteToggle() {
    const nextIsInviteOpen = !isInviteOpen;

    setIsInviteOpen(nextIsInviteOpen);

    if (nextIsInviteOpen && !activeInvite && !isCreatingInvite) {
      void handleCreateInvite(inviteMethod);
    }
  }

  function handleInviteMethodChange(method: InviteMethod) {
    setInviteMethod(method);

    if (!activeInvite && !isCreatingInvite) {
      void handleCreateInvite(method);
    }
  }

  function handleOpenEditor() {
    setIsEditing(true);
    setIsInviteOpen(false);
  }

  function handleBackToRoster() {
    setIsEditing(false);
    setOpenMemberId(null);
    setIsInviteOpen(false);
  }

  async function handleRelationshipChange(
    memberId: string,
    relationship: Relationship,
  ) {
    setSavingMemberId(memberId);

    try {
      const nextFamily = await apiRequest<FamilyState>(
        `/api/app/family/members/${memberId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ relationship }),
        },
      );

      setFamily(nextFamily);
      queueActionStatus("Relationship updated.");
    } catch (error) {
      queueActionStatus(
        getApiErrorMessage(error, "Could not update relationship."),
      );
    } finally {
      setSavingMemberId(null);
    }
  }

  async function handleRemoveMember(memberId: string) {
    setSavingMemberId(memberId);

    try {
      const nextFamily = await apiRequest<FamilyState>(
        `/api/app/family/members/${memberId}`,
        { method: "DELETE" },
      );

      setFamily(nextFamily);
      setOpenMemberId(null);
      queueActionStatus("Member removed.");
    } catch (error) {
      queueActionStatus(getApiErrorMessage(error, "Could not remove member."));
    } finally {
      setSavingMemberId(null);
    }
  }

  return (
    <main className="h-dvh overflow-hidden bg-background text-text">
      <div className="flex h-full min-h-0 w-full">
        <AppSideNavigation
          activeItem="Family"
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
        />

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="z-20 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur lg:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <motion.button
                className="hidden size-10 place-items-center rounded-md border border-border bg-surface text-text-muted transition hover:text-text lg:grid"
                type="button"
                aria-label="Open navigation"
                aria-controls="family-navigation"
                aria-expanded={isHistoryOpen}
                onClick={() => setIsHistoryOpen(true)}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
              >
                <Menu className="size-5" strokeWidth={1.8} aria-hidden="true" />
              </motion.button>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">
                  Family settings
                </p>
                <p className="truncate text-xs text-text-soft">
                  {householdName}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 sm:inline-flex">
                {canManageFamily ? "Admin" : "Member"}
              </span>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-28 pt-8 sm:px-6 lg:px-8 lg:pb-8">
            <div className="mx-auto w-full max-w-xl">
              {isLoadingFamily ? (
                <div className="mx-auto flex w-full max-w-md items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium text-text-muted">
                  <LoaderCircle
                    className="size-4 animate-spin"
                    strokeWidth={1.9}
                    aria-hidden="true"
                  />
                  Loading family members
                </div>
              ) : null}

              {familyError ? (
                <div
                  className="mx-auto w-full max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-danger"
                  role="alert"
                >
                  {familyError}
                </div>
              ) : null}

              {!isLoadingFamily && !familyError ? (
                <AnimatePresence mode="wait">
                  {!isEditing ? (
                    <motion.section
                      key="family-roster"
                      className="mx-auto w-full max-w-md"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      aria-labelledby="family-roster-title"
                    >
                      <div className="mb-6 text-center">
                        <p className="text-xs font-semibold uppercase text-text-soft">
                          Household
                        </p>
                        <h1
                          id="family-roster-title"
                          className="mt-2 text-2xl font-semibold text-text"
                        >
                          {householdName}
                        </h1>
                      </div>

                      <ul className="grid gap-1" aria-label="Family members">
                        {members.map((member, index) => (
                          <FamilyMemberRow
                            key={member.id}
                            member={member}
                            index={index}
                          />
                        ))}
                      </ul>

                      {canManageFamily ? (
                        <div className="mt-5 grid gap-3">
                          <FamilyActionCard
                            title="Edit members"
                            subtext="Add or remove members"
                            Icon={Edit3}
                            onClick={handleOpenEditor}
                          />
                        </div>
                      ) : null}
                    </motion.section>
                  ) : (
                    <motion.section
                      key="family-editor"
                      className="grid gap-4"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      aria-labelledby="family-editor-title"
                    >
                      <div className="flex items-center gap-3">
                        <motion.button
                          className="grid size-10 place-items-center rounded-full border border-border bg-surface text-text-muted transition hover:text-text"
                          type="button"
                          aria-label="Back to family members"
                          onClick={handleBackToRoster}
                          whileHover={{ y: -1 }}
                          whileTap={{ scale: 0.96 }}
                        >
                          <ChevronLeft
                            className="size-5"
                            strokeWidth={1.8}
                            aria-hidden="true"
                          />
                        </motion.button>
                        <div className="min-w-0">
                          <h1
                            id="family-editor-title"
                            className="text-2xl font-semibold text-text"
                          >
                            Edit members
                          </h1>
                          <p className="mt-1 text-sm text-text-soft">
                            Add or remove members
                          </p>
                        </div>
                      </div>

                      <div
                        className="grid gap-3"
                        aria-label="Editable family members"
                      >
                        <AnimatePresence initial={false} mode="popLayout">
                          {members.map((member) => (
                            <EditableMemberRow
                              key={member.id}
                              member={member}
                              isOpen={openMemberId === member.id}
                              isSaving={savingMemberId === member.id}
                              onToggle={() =>
                                setOpenMemberId((currentMemberId) =>
                                  currentMemberId === member.id
                                    ? null
                                    : member.id,
                                )
                              }
                              onRelationshipChange={(relationship) =>
                                handleRelationshipChange(
                                  member.id,
                                  relationship,
                                )
                              }
                              onRemove={() => handleRemoveMember(member.id)}
                            />
                          ))}
                        </AnimatePresence>
                      </div>

                      <FamilyActionCard
                        title="Add members to your plan"
                        subtext="Invite by link, QR, or code"
                        Icon={UserRoundPlus}
                        isSelected={isInviteOpen}
                        onClick={handleInviteToggle}
                      />

                      <AnimatePresence>
                        {isInviteOpen ? (
                          <InvitePanel
                            method={inviteMethod}
                            invite={activeInvite}
                            isLoading={isCreatingInvite}
                            error={inviteError}
                            onMethodChange={handleInviteMethodChange}
                            onCopy={handleCopy}
                          />
                        ) : null}
                      </AnimatePresence>

                      <AnimatePresence>
                        {actionStatus ? (
                          <motion.div
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"
                            role="status"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.16, ease: "easeOut" }}
                          >
                            {actionStatus}
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </motion.section>
                  )}
                </AnimatePresence>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
