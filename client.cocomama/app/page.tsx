"use client";

import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AudioWaveform,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  Pencil,
  LoaderCircle,
  Menu,
  Mic,
  MicOff,
  Plus,
  Save,
  SendHorizontal,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type FormEvent,
  type RefCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppSideNavigation } from "./components/app-side-navigation";
import {
  blobToBase64,
  getPreferredAudioMimeType,
  VoicePlaybackController,
  type VoiceConversationStatus,
  type VoiceTranscriptionApiResponse,
  voiceStatusLabels,
} from "@/lib/voice-conversation";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  toolCalls?: ChatToolCallSummary[];
  isError?: boolean;
  excludedFromAi?: boolean;
};

type ChatToolCallSummary = {
  name: string;
  label?: string;
  status: string;
  input?: Record<string, unknown>;
  result?: FinancialRecordResult;
};

type FinancialRecordResult = {
  expenseId?: string;
  incomeId?: string;
  savingId?: string;
  amountMinor?: number;
  targetAmountMinor?: number | null;
  recurringContributionMinor?: number | null;
  currency?: string;
  formattedAmount?: string;
  formattedTargetAmount?: string | null;
  formattedRecurringContribution?: string | null;
  originalAmountMinor?: number | null;
  originalCurrency?: string | null;
  exchangeRate?: string | null;
  exchangeRateSource?: string | null;
  walletAccountId?: string;
  walletAccountName?: string;
  walletAccountType?: "main" | "saving";
  walletBalanceMinor?: number;
  walletCurrency?: string;
  formattedWalletBalance?: string;
  description?: string;
  category?: string;
  categoryEmoji?: string;
  sourceName?: string;
  title?: string;
  recordDatetime?: string;
  occurredAt?: string;
  receivedAt?: string;
  recurrenceStatus?: "unknown" | "one_time" | "recurring";
  recurrenceCadence?: "weekly" | "monthly" | "yearly" | null;
  status?: "draft" | "active" | "completed";
  needsHumanFeedback?: boolean;
  originalUserMessage?: string;
  question?: string;
  learned?: boolean;
};

type RecordKind = "expense" | "income" | "saving";
type RecurrenceStatus = NonNullable<FinancialRecordResult["recurrenceStatus"]>;
type RecurrenceCadence = NonNullable<
  FinancialRecordResult["recurrenceCadence"]
>;
type SavingStatus = NonNullable<FinancialRecordResult["status"]>;
type ManualTransactionForm = {
  type: "expense" | "income" | "savings";
  amount: string;
  currency: string;
  category: string;
  description: string;
  merchant: string;
  occurredAt: string;
  isRecurring: boolean;
};

const manualTransactionTypes: Array<{
  value: ManualTransactionForm["type"];
  label: string;
  helper: string;
}> = [
  { value: "expense", label: "Expense", helper: "Money out" },
  { value: "income", label: "Income", helper: "Money in" },
  { value: "savings", label: "Savings", helper: "Set aside" },
];

const manualTransactionCurrencies = ["NPR", "USD", "INR", "EUR"];

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

type ChatApiResponse = {
  ok: boolean;
  data?: {
    response: string;
    model: string;
    conversationId: string;
    toolCalls?: ChatToolCallSummary[];
    session?: ChatSessionSummary;
  };
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
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

type ChatSessionApiResponse = {
  ok: boolean;
  data?: {
    session: ChatSessionSummary & {
      messages: ChatMessage[];
    };
  };
  error?: {
    code: string;
    message: string;
  };
};

type SendChatMessageResult =
  | {
      ok: true;
      response: string;
      toolCalls: ChatToolCallSummary[];
    }
  | {
      ok: false;
      aborted?: boolean;
      error?: string;
    };

type AppMeResponse = {
  user?: {
    id?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

type BudgetNotificationItem = {
  id: string;
  budgetId: string;
  title: string;
  body: string;
  scheduledFor: string;
};

type BudgetNotificationsApiResponse = {
  ok: boolean;
  notifications?: BudgetNotificationItem[];
  error?: string;
};

const initialMessages: ChatMessage[] = [];

const chatSuggestions = [
  "I spent $18 on lunch today",
  "I spent $42 on groceries today",
  "Can I buy headphones this month?",
  "Plan my grocery budget for this week",
  "How much can we save this month?",
];

const chatInputLineHeightPx = 24;
const chatInputVerticalPaddingPx = 16;
const chatInputMaxRows = 4;
const chatInputMaxHeightPx =
  chatInputLineHeightPx * chatInputMaxRows + chatInputVerticalPaddingPx;
const voiceStartRmsThreshold = 0.04;
const voiceStopRmsThreshold = 0.025;
const voiceSilenceEndDelayMs = 850;
const voiceMinimumSpeechMs = 350;
const voiceMaximumSpeechMs = 22_000;
const voiceMinimumAudioBytes = 900;

const aiDisclaimerDismissedStorageKey = "cocomama_ai_disclaimer_dismissed";

const thinkingStatusLabels = [
  "Thinking",
  "Inferring",
  "Reading context",
  "Checking categories",
  "Reasoning",
  "Weighing options",
  "Estimating",
  "Looking for patterns",
  "Drafting",
  "Grounding answer",
  "Reviewing tools",
  "Steering",
  "Connecting dots",
  "Almost there",
];

function createSessionTitle(messageText: string) {
  const normalizedMessage = messageText.replace(/\s+/g, " ").trim();

  if (normalizedMessage.length <= 48) {
    return normalizedMessage || "New chat";
  }

  return `${normalizedMessage.slice(0, 45)}...`;
}

function ThinkingMessage() {
  const [statusIndex, setStatusIndex] = useState(0);
  const statusLabel = thinkingStatusLabels[statusIndex] ?? "Thinking";

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setStatusIndex(
        (currentIndex) => (currentIndex + 1) % thinkingStatusLabels.length,
      );
    }, 1500);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <motion.article
      aria-label={`Cocobaa is ${statusLabel.toLowerCase()}`}
      className="flex px-1"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div className="inline-flex items-center gap-2.5 rounded-full bg-surface-muted px-3 py-2 text-text shadow-sm">
        <span className="flex items-center gap-1" aria-hidden="true">
          {[0, 1, 2].map((dot) => (
            <motion.span
              key={dot}
              className="size-1.5 rounded-full bg-text-soft"
              animate={{ opacity: [0.35, 1, 0.35], y: [0, -3, 0] }}
              transition={{
                duration: 0.9,
                ease: "easeInOut",
                repeat: Infinity,
                delay: dot * 0.14,
              }}
            />
          ))}
        </span>
        <motion.span
          key={statusLabel}
          className="min-w-28 text-sm font-semibold text-text-muted"
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          {statusLabel}...
        </motion.span>
      </div>
    </motion.article>
  );
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block rounded-md bg-surface-muted motion-safe:animate-pulse ${className}`}
    />
  );
}

function ChatPageSkeleton() {
  return (
    <motion.div
      className="flex min-h-0 flex-1 flex-col"
      aria-busy="true"
      aria-label="Loading chat"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-8 pt-5 sm:px-6 lg:pt-8">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-8">
          <p className="sr-only">Loading chat</p>

          <div className="grid gap-3 text-center" aria-hidden="true">
            <SkeletonBlock className="mx-auto h-4 w-32" />
            <SkeletonBlock className="mx-auto h-8 w-full max-w-md rounded-lg" />
          </div>

          <div className="space-y-6" aria-hidden="true">
            <div className="px-1">
              <div className="max-w-170 rounded-lg border border-border/70 bg-surface/75 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <SkeletonBlock className="size-7 rounded-full bg-primary/10" />
                  <SkeletonBlock className="h-3 w-24" />
                </div>
                <div className="grid gap-2.5">
                  <SkeletonBlock className="h-4 w-11/12" />
                  <SkeletonBlock className="h-4 w-full" />
                  <SkeletonBlock className="h-4 w-8/12" />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="w-full max-w-80 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3">
                <div className="grid gap-2.5">
                  <SkeletonBlock className="h-4 w-11/12 bg-primary/20" />
                  <SkeletonBlock className="h-4 w-7/12 bg-primary/20" />
                </div>
              </div>
            </div>

            <div className="px-1">
              <div className="max-w-xl rounded-lg border border-border bg-surface p-3 shadow-sm">
                <div className="flex items-start gap-3">
                  <SkeletonBlock className="size-9 shrink-0 rounded-md bg-primary/10" />
                  <div className="min-w-0 flex-1">
                    <SkeletonBlock className="h-4 w-36" />
                    <SkeletonBlock className="mt-2 h-3 w-24" />
                  </div>
                  <SkeletonBlock className="h-9 w-16" />
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <SkeletonBlock className="h-6 w-28" />
                  <SkeletonBlock className="h-4 w-40 sm:justify-self-end" />
                  <SkeletonBlock className="h-4 w-32" />
                  <SkeletonBlock className="h-4 w-24 sm:justify-self-end" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-background/96 px-4 py-3 backdrop-blur">
        <div
          className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-border bg-surface p-2 shadow-[0_8px_24px_rgba(15,23,42,0.055)]"
          aria-hidden="true"
        >
          <SkeletonBlock className="size-10 shrink-0" />
          <div className="flex min-h-10 flex-1 items-center px-2">
            <SkeletonBlock className="h-4 w-4/5 max-w-lg" />
          </div>
          <SkeletonBlock className="size-10 shrink-0 bg-text/15" />
        </div>
      </div>
    </motion.div>
  );
}

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="mb-3 text-xl font-semibold leading-7 text-text last:mb-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-3 text-lg font-semibold leading-7 text-text last:mb-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-2 text-base font-semibold leading-6 text-text last:mb-0">
            {children}
          </h3>
        ),
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        strong: ({ children }) => (
          <strong className="font-semibold text-text">{children}</strong>
        ),
        ul: ({ children }) => (
          <ul className="mb-3 ml-5 list-disc space-y-1 last:mb-0">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-3 ml-5 list-decimal space-y-1 last:mb-0">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="pl-1">{children}</li>,
        a: ({ children, href }) => (
          <a
            className="font-medium text-primary underline decoration-primary/35 underline-offset-3 transition hover:decoration-primary"
            href={href}
            rel="noreferrer"
            target="_blank"
          >
            {children}
          </a>
        ),
        code: ({ children }) => (
          <code className="rounded-sm border border-border bg-surface px-1 py-0.5 font-mono text-[0.92em] text-text">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="mb-3 overflow-x-auto rounded-md border border-border bg-surface p-3 text-sm leading-6 last:mb-0">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="my-4 max-w-full overflow-x-auto rounded-lg border border-border bg-surface last:mb-0">
            <table className="min-w-full border-collapse text-left text-sm leading-6">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="border-b border-border bg-surface-muted text-xs font-semibold uppercase text-text-muted">
            {children}
          </thead>
        ),
        tbody: ({ children }) => (
          <tbody className="divide-y divide-border/80">{children}</tbody>
        ),
        tr: ({ children }) => (
          <tr className="transition odd:bg-surface even:bg-background/45 hover:bg-primary/5">
            {children}
          </tr>
        ),
        th: ({ children }) => (
          <th className="whitespace-nowrap px-3 py-2.5 align-bottom font-semibold text-text-muted first:pl-4 last:pr-4">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="min-w-28 px-3 py-2.5 align-top text-text-muted first:pl-4 last:pr-4">
            {children}
          </td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function getToolCallLabel(toolCall: ChatToolCallSummary) {
  if (toolCall.label) {
    return toolCall.label;
  }

  if (toolCall.name === "record_expense") {
    return "Expense saved";
  }

  if (
    toolCall.name === "get_recent_expenses" ||
    toolCall.name === "query_expenses" ||
    toolCall.name === "query_transactions"
  ) {
    return toolCall.name === "query_expenses" ||
      toolCall.name === "query_transactions"
      ? "Expenses queried"
      : "Recent expenses loaded";
  }

  if (toolCall.name === "query_categories") {
    return "Categories listed";
  }

  if (toolCall.name === "query_user") {
    return "User info queried";
  }

  if (toolCall.name === "query_budgets") {
    return "Budgets queried";
  }

  if (toolCall.name === "clarify") {
    return "Clarification requested";
  }

  if (toolCall.name === "record_income") {
    return "Income saved";
  }

  if (toolCall.name === "prepare_saving_goal") {
    return toolCall.status === "success"
      ? "Saving goal saved"
      : "Saving details needed";
  }

  return "Action completed";
}

function getRecordKind(toolCall: ChatToolCallSummary): RecordKind | null {
  if (toolCall.name === "record_expense" && toolCall.result?.expenseId) {
    return "expense";
  }

  if (toolCall.name === "record_income" && toolCall.result?.incomeId) {
    return "income";
  }

  if (toolCall.name === "prepare_saving_goal" && toolCall.result?.savingId) {
    return "saving";
  }

  return null;
}

function getVisibleToolCalls(toolCalls: ChatToolCallSummary[] = []) {
  return toolCalls.filter((toolCall) => {
    if (
      toolCall.status !== "success" ||
      toolCall.name === "get_current_user_currency" ||
      getRecordKind(toolCall)
    ) {
      return false;
    }
    return true;
  });
}

function QueryInputHoverCard({
  onFloatingNode,
  floatingStyles,
  floatingProps,
  inputJson,
}: {
  onFloatingNode: RefCallback<HTMLDivElement>;
  floatingStyles: CSSProperties;
  floatingProps: Record<string, unknown>;
  inputJson: string;
}) {
  return (
    <div
      ref={onFloatingNode}
      className="z-60 w-90 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-background p-3 text-left shadow-[0_14px_40px_rgba(15,23,42,0.12)]"
      style={floatingStyles}
      {...floatingProps}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase text-text-soft">
          Query input
        </span>
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-text-soft">
          JSON
        </span>
      </div>
      <code className="block max-h-70 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-muted p-3 font-mono text-xs leading-5 text-text-muted">
        {inputJson}
      </code>
    </div>
  );
}

function ToolStatusChip({ toolCall }: { toolCall: ChatToolCallSummary }) {
  const hasInputJson = Boolean(toolCall.input);
  const [isHoverCardOpen, setIsHoverCardOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open: isHoverCardOpen,
    onOpenChange: setIsHoverCardOpen,
    placement: "top-start",
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip(), shift({ padding: 12 })],
  });
  const hover = useHover(context, {
    enabled: hasInputJson,
    move: false,
    restMs: 80,
  });
  const focus = useFocus(context, { enabled: hasInputJson });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);
  const inputJson = toolCall.input
    ? JSON.stringify(toolCall.input, null, 2)
    : "{}";
  const [referenceNode, setReferenceNode] = useState<HTMLSpanElement | null>(
    null,
  );
  const [floatingNode, setFloatingNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    refs.setReference(referenceNode);
  }, [referenceNode, refs]);

  useEffect(() => {
    refs.setFloating(floatingNode);
  }, [floatingNode, refs]);

  return (
    <span className="inline-flex">
      <span
        ref={setReferenceNode}
        tabIndex={hasInputJson ? 0 : undefined}
        {...getReferenceProps()}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
          hasInputJson
            ? "cursor-default border-border bg-surface-muted/70 text-text-soft outline-none hover:bg-surface hover:text-text-muted focus-visible:border-primary/40 focus-visible:bg-surface"
            : "border-emerald-200 bg-emerald-50 text-emerald-800"
        }`}
      >
        <CheckCircle2
          className={`size-3.5 ${hasInputJson ? "text-text-soft" : ""}`}
          strokeWidth={1.9}
          aria-hidden="true"
        />
        {getToolCallLabel(toolCall)}
      </span>
      {hasInputJson && isHoverCardOpen ? (
        <FloatingPortal>
          <QueryInputHoverCard
            onFloatingNode={setFloatingNode}
            floatingStyles={floatingStyles}
            floatingProps={getFloatingProps()}
            inputJson={inputJson}
          />
        </FloatingPortal>
      ) : null}
    </span>
  );
}

function getFeedbackRequest(toolCalls: ChatToolCallSummary[] = []) {
  return toolCalls.find(
    (toolCall) =>
      toolCall.name === "collect_ai_feedback" &&
      toolCall.status === "skipped" &&
      toolCall.result?.needsHumanFeedback,
  );
}

function minorToAmount(value?: number | null) {
  return value === null || value === undefined ? "" : String(value / 100);
}

function formatMinorAmount(value?: number | null, currency?: string | null) {
  if (value === null || value === undefined) {
    return "";
  }

  const amount = (value / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return currency ? `${currency} ${amount}` : amount;
}

function getRecordDateTime(kind: RecordKind, result: FinancialRecordResult) {
  if (kind === "income") {
    return result.recordDatetime ?? result.receivedAt;
  }

  if (kind === "expense") {
    return result.recordDatetime ?? result.occurredAt;
  }

  return undefined;
}

function toDateTimeInputValue(value?: string) {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const timezoneOffsetMs = safeDate.getTimezoneOffset() * 60_000;

  return new Date(safeDate.getTime() - timezoneOffsetMs)
    .toISOString()
    .slice(0, 16);
}

function toIsoDateTime(value: string) {
  return new Date(value).toISOString();
}

function formatDateTime(value?: string) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function readableRecurrence(status?: string, cadence?: string | null) {
  if (status === "recurring") {
    return cadence ? `Recurring ${cadence}` : "Recurring";
  }

  if (status === "unknown") {
    return "Recurrence unknown";
  }

  return "One-time";
}

function toRecurrenceStatus(value: string): RecurrenceStatus {
  return value === "recurring" || value === "unknown" ? value : "one_time";
}

function toRecurrenceCadence(value: string): RecurrenceCadence {
  if (value === "weekly" || value === "yearly") {
    return value;
  }

  return "monthly";
}

function toSavingStatus(value: string): SavingStatus {
  if (value === "active" || value === "completed") {
    return value;
  }

  return "draft";
}

function buildRecordForm(kind: RecordKind, result: FinancialRecordResult) {
  return {
    amount:
      kind === "saving"
        ? minorToAmount(result.targetAmountMinor)
        : minorToAmount(result.amountMinor),
    currency: result.currency ?? "USD",
    description: result.description ?? result.title ?? "",
    category: result.category ?? "Uncategorized",
    sourceName: result.sourceName ?? result.title ?? "Income",
    title:
      result.title ??
      result.description ??
      result.sourceName ??
      (kind === "saving" ? "Saving goal" : "Transaction"),
    recordDatetime: toDateTimeInputValue(getRecordDateTime(kind, result)),
    recurrenceStatus: result.recurrenceStatus ?? "one_time",
    recurrenceCadence: result.recurrenceCadence ?? "monthly",
    status: result.status ?? "draft",
    recurringContribution: minorToAmount(result.recurringContributionMinor),
  };
}

function recordEndpoint(kind: RecordKind, result: FinancialRecordResult) {
  if (kind === "expense") {
    return `/api/app/records/expenses/${result.expenseId}`;
  }

  if (kind === "income") {
    return `/api/app/records/incomes/${result.incomeId}`;
  }

  return `/api/app/records/savings/${result.savingId}`;
}

function createManualTransactionForm(): ManualTransactionForm {
  return {
    type: "expense",
    amount: "",
    currency: "NPR",
    category: "other",
    description: "",
    merchant: "",
    occurredAt: toDateTimeInputValue(new Date().toISOString()),
    isRecurring: false,
  };
}

function FinancialRecordCard({
  messageId,
  toolCall,
  toolCallIndex,
  onSaved,
}: {
  messageId: string;
  toolCall: ChatToolCallSummary;
  toolCallIndex: number;
  onSaved: (toolCallIndex: number, result: FinancialRecordResult) => void;
}) {
  const kind = getRecordKind(toolCall);
  const result = toolCall.result;
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(() =>
    kind && result ? buildRecordForm(kind, result) : null,
  );

  if (!kind || !result || !form) {
    return null;
  }

  const activeKind = kind;
  const activeResult = result;
  const activeForm = form;

  const title =
    result.title ??
    (kind === "expense"
      ? result.description
      : kind === "income"
        ? result.sourceName
        : "Saving goal");
  const amount =
    kind === "saving" ? result.formattedTargetAmount : result.formattedAmount;
  const recordDateTime = getRecordDateTime(kind, result);
  const originalAmount = formatMinorAmount(
    result.originalAmountMinor,
    result.originalCurrency,
  );
  const recordId =
    kind === "expense"
      ? result.expenseId
      : kind === "income"
        ? result.incomeId
        : result.savingId;
  const primaryDetail =
    kind === "expense"
      ? result.categoryEmoji && result.category
        ? `${result.categoryEmoji} ${result.category}`
        : result.category
      : kind === "income"
        ? result.sourceName
        : result.status;
  const secondaryDetails = [
    result.formattedWalletBalance
      ? `${result.walletAccountName ?? "Wallet"}: ${result.formattedWalletBalance}`
      : null,
    kind !== "saving" ? `Title: ${title}` : null,
    kind !== "saving" && originalAmount ? `Original: ${originalAmount}` : null,
    result.exchangeRate ? `FX: ${result.exchangeRate}` : null,
    recordId ? `ID: ${recordId}` : null,
  ].filter(Boolean);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");

    try {
      const payload =
        activeKind === "expense"
          ? {
              amount: Number(activeForm.amount),
              currency: activeForm.currency,
              title: activeForm.title,
              description: activeForm.description,
              category: activeForm.category,
              recordDatetime: toIsoDateTime(activeForm.recordDatetime),
              occurredAt: toIsoDateTime(activeForm.recordDatetime),
              recurrenceStatus: activeForm.recurrenceStatus,
              recurrenceCadence: activeForm.recurrenceCadence,
            }
          : activeKind === "income"
            ? {
                amount: Number(activeForm.amount),
                currency: activeForm.currency,
                title: activeForm.title,
                sourceName: activeForm.sourceName,
                recordDatetime: toIsoDateTime(activeForm.recordDatetime),
                receivedAt: toIsoDateTime(activeForm.recordDatetime),
                recurrenceStatus: activeForm.recurrenceStatus,
                recurrenceCadence: activeForm.recurrenceCadence,
              }
            : {
                title: activeForm.title,
                targetAmount: Number(activeForm.amount),
                currency: activeForm.currency,
                recurringContribution: activeForm.recurringContribution
                  ? Number(activeForm.recurringContribution)
                  : null,
                recurrenceStatus: activeForm.recurrenceStatus,
                recurrenceCadence: activeForm.recurrenceCadence,
                status: activeForm.status,
              };
      const response = await fetch(recordEndpoint(activeKind, activeResult), {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as {
        record?: FinancialRecordResult;
        error?: string;
      } | null;

      if (!response.ok || !body?.record) {
        throw new Error(body?.error ?? "record_update_failed");
      }

      onSaved(toolCallIndex, body.record);
      setForm(buildRecordForm(activeKind, body.record));
      setIsEditing(false);
    } catch {
      setError("Could not update this record. Check the fields and try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <motion.article
      className="mt-3 max-w-xl rounded-lg border border-border bg-surface p-3 text-sm shadow-sm"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      aria-labelledby={`${messageId}-${toolCall.name}-${toolCallIndex}-title`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-emerald-50 text-primary">
            {result.categoryEmoji ? (
              <span className="text-lg leading-none" aria-hidden="true">
                {result.categoryEmoji}
              </span>
            ) : (
              <CircleDollarSign
                className="size-5"
                strokeWidth={1.9}
                aria-hidden="true"
              />
            )}
          </span>
          <div className="min-w-0">
            <p
              id={`${messageId}-${toolCall.name}-${toolCallIndex}-title`}
              className="truncate font-semibold text-text"
            >
              {title}
            </p>
            <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-text-soft">
              {getToolCallLabel(toolCall)}
            </p>
          </div>
        </div>
        <button
          className="group/action relative grid size-9 place-items-center rounded-md border border-border bg-background text-text-muted transition hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={() => {
            setIsEditing((current) => !current);
            setError("");
          }}
          disabled={isSaving}
          aria-label={isEditing ? "Cancel editing" : "Edit record"}
        >
          {isEditing ? (
            <X className="size-4" strokeWidth={1.9} aria-hidden="true" />
          ) : (
            <Pencil className="size-4" strokeWidth={1.9} aria-hidden="true" />
          )}
          <span className="pointer-events-none absolute left-1/2 top-10 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold text-text-muted opacity-0 shadow-sm transition group-hover/action:opacity-100 group-focus-visible/action:opacity-100">
            {isEditing ? "Cancel" : "Edit"}
          </span>
        </button>
      </div>

      {isEditing ? (
        <form className="mt-3 grid gap-3" onSubmit={handleSave}>
          {kind !== "saving" ? (
            <label className="grid gap-1 text-xs font-semibold text-text-muted">
              Title
              <input
                className="min-h-10 rounded-md border border-border bg-background px-3 text-sm font-normal text-text outline-none focus:border-primary"
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                required
              />
            </label>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-text-muted">
              {kind === "saving" ? "Target amount" : "Amount"}
              <input
                className="min-h-10 rounded-md border border-border bg-background px-3 text-sm font-normal text-text outline-none focus:border-primary"
                value={form.amount}
                onChange={(event) =>
                  setForm({ ...form, amount: event.target.value })
                }
                inputMode="decimal"
                required
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-text-muted">
              Currency
              <input
                className="min-h-10 rounded-md border border-border bg-background px-3 text-sm font-normal uppercase text-text outline-none focus:border-primary"
                value={form.currency}
                onChange={(event) =>
                  setForm({
                    ...form,
                    currency: event.target.value.toUpperCase().slice(0, 3),
                  })
                }
                maxLength={3}
                required
              />
            </label>
          </div>

          {kind === "expense" ? (
            <div className="grid gap-3">
              <label className="grid gap-1 text-xs font-semibold text-text-muted">
                Description
                <input
                  className="min-h-10 rounded-md border border-border bg-background px-3 text-sm font-normal text-text outline-none focus:border-primary"
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  required
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold text-text-muted">
                  Category
                  <input
                    className="min-h-10 rounded-md border border-border bg-background px-3 text-sm font-normal text-text outline-none focus:border-primary"
                    value={form.category}
                    onChange={(event) =>
                      setForm({ ...form, category: event.target.value })
                    }
                    required
                  />
                </label>
              </div>
            </div>
          ) : null}

          {kind === "income" ? (
            <label className="grid gap-1 text-xs font-semibold text-text-muted">
              Source
              <input
                className="min-h-10 rounded-md border border-border bg-background px-3 text-sm font-normal text-text outline-none focus:border-primary"
                value={form.sourceName}
                onChange={(event) =>
                  setForm({ ...form, sourceName: event.target.value })
                }
                required
              />
            </label>
          ) : null}

          {kind === "saving" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold text-text-muted">
                Goal
                <input
                  className="min-h-10 rounded-md border border-border bg-background px-3 text-sm font-normal text-text outline-none focus:border-primary"
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  required
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-text-muted">
                Monthly contribution
                <input
                  className="min-h-10 rounded-md border border-border bg-background px-3 text-sm font-normal text-text outline-none focus:border-primary"
                  value={form.recurringContribution}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      recurringContribution: event.target.value,
                    })
                  }
                  inputMode="decimal"
                />
              </label>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            {kind !== "saving" ? (
              <label className="grid gap-1 text-xs font-semibold text-text-muted">
                Transaction date and time
                <input
                  className="min-h-10 rounded-md border border-border bg-background px-3 text-sm font-normal text-text outline-none focus:border-primary"
                  value={form.recordDatetime}
                  onChange={(event) =>
                    setForm({ ...form, recordDatetime: event.target.value })
                  }
                  type="datetime-local"
                  required
                />
              </label>
            ) : null}
            <label className="grid gap-1 text-xs font-semibold text-text-muted">
              Recurrence
              <select
                className="min-h-10 rounded-md border border-border bg-background px-3 text-sm font-normal text-text outline-none focus:border-primary"
                value={form.recurrenceStatus}
                onChange={(event) =>
                  setForm({
                    ...form,
                    recurrenceStatus: toRecurrenceStatus(event.target.value),
                  })
                }
              >
                <option value="one_time">One-time</option>
                <option value="recurring">Recurring</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-text-muted">
              Cadence
              <select
                className="min-h-10 rounded-md border border-border bg-background px-3 text-sm font-normal text-text outline-none focus:border-primary disabled:opacity-50"
                value={form.recurrenceCadence}
                onChange={(event) =>
                  setForm({
                    ...form,
                    recurrenceCadence: toRecurrenceCadence(event.target.value),
                  })
                }
                disabled={form.recurrenceStatus !== "recurring"}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            {kind === "saving" ? (
              <label className="grid gap-1 text-xs font-semibold text-text-muted">
                Status
                <select
                  className="min-h-10 rounded-md border border-border bg-background px-3 text-sm font-normal text-text outline-none focus:border-primary"
                  value={form.status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: toSavingStatus(event.target.value),
                    })
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
            ) : null}
          </div>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-danger">
              {error}
            </p>
          ) : null}

          <button
            className="inline-flex min-h-10 w-fit items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? (
              <LoaderCircle
                className="size-4 animate-spin"
                strokeWidth={1.9}
                aria-hidden="true"
              />
            ) : (
              <Save className="size-4" strokeWidth={1.9} aria-hidden="true" />
            )}
            Save record
          </button>
        </form>
      ) : (
        <div className="mt-3 grid gap-2 text-sm text-text-muted sm:grid-cols-2">
          <p className="text-lg font-semibold text-text">{amount}</p>
          <p className="inline-flex items-center gap-1.5 sm:justify-end">
            <CalendarDays
              className="size-4 text-text-soft"
              strokeWidth={1.9}
              aria-hidden="true"
            />
            {kind !== "saving" ? formatDateTime(recordDateTime) : result.status}
          </p>
          {primaryDetail ? <p>{primaryDetail}</p> : null}
          <p className="sm:text-right">
            {readableRecurrence(
              result.recurrenceStatus,
              result.recurrenceCadence,
            )}
          </p>
          {secondaryDetails.length > 0 ? (
            <p className="wrap-break-word text-xs leading-5 text-text-soft sm:col-span-2">
              {secondaryDetails.join(" | ")}
            </p>
          ) : null}
        </div>
      )}
    </motion.article>
  );
}

function FeedbackTeachForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (message: string) => Promise<unknown>;
}) {
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const trimmedValue = value.trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!trimmedValue || disabled || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit(trimmedValue);
      setValue("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <motion.form
      className="mt-3 grid max-w-xl gap-2 rounded-lg border border-border bg-surface p-3 text-sm shadow-sm"
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <label className="grid gap-1 text-xs font-semibold text-text-muted">
        Teach Cocobaa
        <textarea
          className="min-h-24 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm font-normal leading-6 text-text outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="This should record a food expense for momo"
          disabled={disabled || isSubmitting}
        />
      </label>
      <div className="flex items-center justify-end gap-2">
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={!trimmedValue || disabled || isSubmitting}
        >
          {isSubmitting ? (
            <LoaderCircle
              className="size-4 animate-spin"
              strokeWidth={1.9}
              aria-hidden="true"
            />
          ) : (
            <SendHorizontal
              className="size-4"
              strokeWidth={1.9}
              aria-hidden="true"
            />
          )}
          Save feedback
        </button>
      </div>
    </motion.form>
  );
}

function ManualTransactionModal({
  form,
  error,
  isSaving,
  onChange,
  onClose,
  onSubmit,
}: {
  form: ManualTransactionForm;
  error: string;
  isSaving: boolean;
  onChange: (form: ManualTransactionForm) => void;
  onClose: () => void;
  onSubmit: () => Promise<void>;
}) {
  const fieldClass =
    "min-h-10 rounded-md border border-border bg-surface px-3 text-sm font-normal text-text outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-60";
  const labelClass = "grid gap-1 text-xs font-semibold text-text-muted";

  return (
    <motion.div
      className="fixed inset-0 z-60 bg-slate-950/25 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Add new transaction"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) {
          onClose();
        }
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="absolute inset-x-4 bottom-24 mx-auto max-w-2xl rounded-xl border border-border bg-background p-4 sm:bottom-28 sm:p-5"
        initial={{ y: 18, opacity: 0.96, scale: 0.99 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 14, opacity: 0, scale: 0.99 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <CircleDollarSign
                className="size-5"
                strokeWidth={1.9}
                aria-hidden="true"
              />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-text">
                Add transaction
              </h2>
              <p className="mt-0.5 text-sm text-text-muted">
                Save it now. Edit the card later in chat.
              </p>
            </div>
          </div>
          <button
            className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-surface text-text-muted transition hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onClose}
            aria-label="Close manual transaction form"
            disabled={isSaving}
          >
            <X className="size-4" strokeWidth={1.9} aria-hidden="true" />
          </button>
        </div>

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          <div className="grid gap-2">
            <span className="text-xs font-semibold text-text-muted">Type</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {manualTransactionTypes.map((transactionType) => {
                const isSelected = form.type === transactionType.value;

                return (
                  <button
                    key={transactionType.value}
                    className={`rounded-md border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      isSelected
                        ? "border-primary bg-primary/10 text-text"
                        : "border-border bg-surface text-text-muted hover:border-primary/35 hover:text-text"
                    }`}
                    type="button"
                    onClick={() =>
                      onChange({ ...form, type: transactionType.value })
                    }
                    disabled={isSaving}
                    aria-pressed={isSelected}
                  >
                    <span className="block text-sm font-semibold">
                      {transactionType.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-text-soft">
                      {transactionType.helper}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_7.5rem]">
            <label className={labelClass}>
              Amount
              <input
                className="min-h-11 rounded-md border border-border bg-surface px-3 text-lg font-semibold text-text outline-none transition placeholder:text-text-soft focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                value={form.amount}
                onChange={(event) =>
                  onChange({ ...form, amount: event.target.value })
                }
                inputMode="decimal"
                placeholder="0.00"
                disabled={isSaving}
                required
              />
            </label>
            <label className={labelClass}>
              Currency
              <select
                className={`${fieldClass} appearance-none bg-surface font-semibold uppercase`}
                value={form.currency}
                onChange={(event) =>
                  onChange({
                    ...form,
                    currency: event.target.value,
                  })
                }
                disabled={isSaving}
                required
              >
                {manualTransactionCurrencies.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3">
            <label className={labelClass}>
              Description
              <input
                className={fieldClass}
                value={form.description}
                onChange={(event) =>
                  onChange({ ...form, description: event.target.value })
                }
                placeholder="Lunch at Boudha"
                disabled={isSaving}
                required
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Category
                <input
                  className={fieldClass}
                  value={form.category}
                  onChange={(event) =>
                    onChange({ ...form, category: event.target.value })
                  }
                  placeholder="food"
                  disabled={isSaving}
                  required
                />
              </label>
              <label className={labelClass}>
                Merchant
                <input
                  className={fieldClass}
                  value={form.merchant}
                  onChange={(event) =>
                    onChange({ ...form, merchant: event.target.value })
                  }
                  placeholder="Optional"
                  disabled={isSaving}
                />
              </label>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className={labelClass}>
              Date and time
              <input
                className={fieldClass}
                value={form.occurredAt}
                onChange={(event) =>
                  onChange({ ...form, occurredAt: event.target.value })
                }
                type="datetime-local"
                disabled={isSaving}
                required
              />
            </label>
            <label className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-muted">
              <input
                onChange={(event) =>
                  onChange({ ...form, isRecurring: event.target.checked })
                }
                checked={form.isRecurring}
                type="checkbox"
                disabled={isSaving}
              />
              Recurring
            </label>
          </div>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button
              className="min-h-10 rounded-md border border-border bg-surface px-4 text-sm font-semibold text-text-muted transition hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              type="submit"
              disabled={isSaving}
            >
              {isSaving ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  strokeWidth={1.9}
                  aria-hidden="true"
                />
              ) : (
                <Save className="size-4" strokeWidth={1.9} aria-hidden="true" />
              )}
              Save
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function CopyMessageButton({
  content,
  align = "left",
  forceVisible = false,
}: {
  content: string;
  align?: "left" | "right";
  forceVisible?: boolean;
}) {
  const [hasCopied, setHasCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setHasCopied(true);
      window.setTimeout(() => setHasCopied(false), 1200);
    } catch {
      setHasCopied(false);
    }
  }

  return (
    <button
      className={`group/action relative mt-1 grid size-8 place-items-center rounded-md border border-border bg-surface text-text-muted shadow-sm transition hover:text-text focus-visible:opacity-100 group-hover:opacity-100 ${
        forceVisible ? "opacity-100" : "opacity-0"
      } ${align === "right" ? "self-end" : "self-start"}`}
      type="button"
      onClick={handleCopy}
      aria-label={hasCopied ? "Message copied" : "Copy message"}
    >
      {hasCopied ? (
        <CheckCircle2 className="size-4" strokeWidth={1.9} aria-hidden="true" />
      ) : (
        <Copy className="size-4" strokeWidth={1.9} aria-hidden="true" />
      )}
      <span className="pointer-events-none absolute left-1/2 top-9 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold text-text-muted opacity-0 shadow-sm transition group-hover/action:opacity-100 group-focus-visible/action:opacity-100">
        {hasCopied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

function EditMessageButton({
  content,
  disabled,
  onEdit,
  forceVisible = false,
}: {
  content: string;
  disabled: boolean;
  onEdit: (content: string) => void;
  forceVisible?: boolean;
}) {
  return (
    <button
      className={`group/action relative mt-1 grid size-8 place-items-center rounded-md border border-border bg-surface text-text-muted shadow-sm transition hover:text-text focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-40 group-hover:opacity-100 ${
        forceVisible ? "opacity-100" : "opacity-0"
      }`}
      type="button"
      onClick={() => onEdit(content)}
      disabled={disabled}
      aria-label="Edit message"
    >
      <Pencil className="size-4" strokeWidth={1.9} aria-hidden="true" />
      <span className="pointer-events-none absolute left-1/2 top-9 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold text-text-muted opacity-0 shadow-sm transition group-hover/action:opacity-100 group-focus-visible/action:opacity-100">
        Edit
      </span>
    </button>
  );
}

function ChatMessageRow({
  message,
  isTyping,
  onToolResultUpdate,
  onFeedbackSubmit,
  onEditMessage,
  showActions = false,
}: {
  message: ChatMessage;
  isTyping: boolean;
  onToolResultUpdate: (
    messageId: string,
    toolCallIndex: number,
    result: FinancialRecordResult,
  ) => void;
  onFeedbackSubmit: (message: string) => Promise<unknown>;
  onEditMessage: (content: string) => void;
  showActions?: boolean;
}) {
  if (message.role === "user") {
    return (
      <motion.article
        className="group flex flex-col items-end"
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <div className="max-w-155 rounded-lg border border-primary/25 bg-primary px-4 py-3 text-base leading-7 text-white shadow-sm">
          {message.content}
        </div>
        <div className="flex items-center gap-1 self-end">
          <EditMessageButton
            content={message.content}
            disabled={isTyping}
            onEdit={onEditMessage}
            forceVisible={showActions}
          />
          <CopyMessageButton
            content={message.content}
            align="right"
            forceVisible={showActions}
          />
        </div>
      </motion.article>
    );
  }

  const feedbackRequest = getFeedbackRequest(message.toolCalls);

  return (
    <motion.article
      className="group px-1"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <div
        className={`max-w-170 text-base leading-7 ${
          message.isError ? "text-danger" : "text-text"
        }`}
      >
        <AssistantMarkdown content={message.content} />
        {!isTyping && feedbackRequest ? (
          <FeedbackTeachForm disabled={isTyping} onSubmit={onFeedbackSubmit} />
        ) : null}
        {getVisibleToolCalls(message.toolCalls).length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {getVisibleToolCalls(message.toolCalls).map((toolCall, index) => (
              <ToolStatusChip
                key={`${message.id}-${toolCall.name}-${index}`}
                toolCall={toolCall}
              />
            ))}
          </div>
        ) : null}
        {!isTyping && message.toolCalls?.some(getRecordKind) ? (
          <div className="mt-3 grid gap-3">
            {message.toolCalls.map((toolCall, toolCallIndex) => (
              <FinancialRecordCard
                key={`${message.id}-${toolCall.name}-${toolCallIndex}`}
                messageId={message.id}
                toolCall={toolCall}
                toolCallIndex={toolCallIndex}
                onSaved={(updatedToolCallIndex, result) =>
                  onToolResultUpdate(message.id, updatedToolCallIndex, result)
                }
              />
            ))}
          </div>
        ) : null}
        {isTyping ? (
          <motion.span
            aria-hidden="true"
            className="ml-0.5 inline-block h-5 w-px translate-y-1 bg-text"
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        ) : null}
        {!isTyping ? (
          <CopyMessageButton
            content={message.content}
            forceVisible={showActions}
          />
        ) : null}
      </div>
    </motion.article>
  );
}

function getChatErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "chat_failed";

  if (code === "ai_not_configured") {
    return "AI chat is warming up right now. Please try again in a moment.";
  }

  if (code === "ai_rate_limited" || code === "rate_limited") {
    return "The AI chat is being rate limited. Wait a moment and try again.";
  }

  if (code === "ai_provider_timeout") {
    return "AI chat is taking longer than expected. Please try again in a moment.";
  }

  if (code === "ai_prompt_blocked") {
    return "Gemini blocked that request. Try rephrasing it as a household budgeting question.";
  }

  if (code === "unauthorized") {
    return "Your session expired. Sign in again to keep chatting.";
  }

  return "I could not reach AI just now. Please try again.";
}

function getApiErrorCode(body: unknown, fallback: string) {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }

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

export default function Home() {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSessionTitle, setActiveSessionTitle] = useState("New chat");
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [showAiDisclaimer, setShowAiDisclaimer] = useState(
    () =>
      typeof localStorage === "undefined" ||
      localStorage.getItem(aiDisclaimerDismissedStorageKey) !== "1",
  );
  const [isManualMenuOpen, setIsManualMenuOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualTransactionForm, setManualTransactionForm] =
    useState<ManualTransactionForm>(() => createManualTransactionForm());
  const [manualTransactionError, setManualTransactionError] = useState("");
  const [isSavingManualTransaction, setIsSavingManualTransaction] =
    useState(false);
  const [budgetNotifications, setBudgetNotifications] = useState<
    BudgetNotificationItem[]
  >([]);
  const [isThinking, setIsThinking] = useState(false);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] =
    useState<VoiceConversationStatus>("idle");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const scrollPaneRef = useRef<HTMLDivElement | null>(null);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatAbortControllerRef = useRef<AbortController | null>(null);
  const thinkingTimeoutRef = useRef<number | null>(null);
  const typingIntervalRef = useRef<number | null>(null);
  const messageIdCounterRef = useRef(0);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceAudioChunksRef = useRef<BlobPart[]>([]);
  const voiceAudioContextRef = useRef<AudioContext | null>(null);
  const voiceAnalyserRef = useRef<AnalyserNode | null>(null);
  const voiceAnimationFrameRef = useRef<number | null>(null);
  const voiceIsListeningRef = useRef(false);
  const voiceIsSpeakingRef = useRef(false);
  const voiceShouldProcessRecordingRef = useRef(false);
  const voiceSilenceStartedAtRef = useRef<number | null>(null);
  const voiceSpeechStartedAtRef = useRef<number | null>(null);
  const voicePlaybackRef = useRef<VoicePlaybackController | null>(null);
  const voiceTtsAbortControllerRef = useRef<AbortController | null>(null);
  const showSuggestions =
    !isLoadingSessions &&
    messages.length === 0 &&
    !isThinking &&
    !loadingSessionId;
  const latestAssistantMessageId = messages
    .toReversed()
    .find((message) => message.role === "assistant")?.id;
  const isVoiceActive =
    voiceStatus !== "idle" &&
    voiceStatus !== "error" &&
    voiceStatus !== "disconnected";
  const voiceButtonDisabled = isLoadingSessions || Boolean(loadingSessionId);

  useEffect(() => {
    return () => {
      if (thinkingTimeoutRef.current) {
        window.clearTimeout(thinkingTimeoutRef.current);
      }
      if (typingIntervalRef.current) {
        window.clearInterval(typingIntervalRef.current);
      }
      chatAbortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (isLoadingSessions || historyError) {
      return;
    }

    let isMounted = true;

    async function recordNotificationDelivery(
      notificationId: string,
      channel: "app" | "browser",
    ) {
      await fetch(`/api/app/budget-notifications/${notificationId}/delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      }).catch(() => null);
    }

    async function showBrowserNotification(
      notification: BudgetNotificationItem,
    ) {
      if (!("Notification" in window)) {
        return;
      }

      const permission =
        Notification.permission === "default"
          ? await Notification.requestPermission().catch(() => "denied")
          : Notification.permission;

      if (permission !== "granted") {
        return;
      }

      new Notification(notification.title, {
        body: notification.body,
        tag: `budget-${notification.id}`,
      });
      await recordNotificationDelivery(notification.id, "browser");
    }

    async function loadBudgetNotifications() {
      const response = await fetch("/api/app/budget-notifications/due", {
        cache: "no-store",
      }).catch(() => null);

      if (!response?.ok) {
        return;
      }

      const body = (await response
        .json()
        .catch(() => null)) as BudgetNotificationsApiResponse | null;
      const notifications = body?.notifications ?? [];

      if (!isMounted || notifications.length === 0) {
        return;
      }

      setBudgetNotifications((currentNotifications) => {
        const seenIds = new Set(currentNotifications.map(({ id }) => id));
        const nextNotifications = notifications.filter(
          ({ id }) => !seenIds.has(id),
        );

        return [...nextNotifications, ...currentNotifications].slice(0, 5);
      });

      await Promise.all(
        notifications.map(async (notification) => {
          await recordNotificationDelivery(notification.id, "app");
          await showBrowserNotification(notification);
        }),
      );
    }

    loadBudgetNotifications();
    const intervalId = window.setInterval(loadBudgetNotifications, 5 * 60_000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [historyError, isLoadingSessions]);

  useEffect(() => {
    let isMounted = true;

    async function loadSessions() {
      setIsLoadingSessions(true);
      setHistoryError("");

      try {
        const meResponse = await fetch("/api/app/me", {
          cache: "no-store",
        });
        const meBody = (await meResponse
          .json()
          .catch(() => null)) as AppMeResponse | null;

        if (!meResponse.ok || !meBody?.user?.id) {
          throw new Error(getApiErrorCode(meBody, "unauthorized"));
        }

        localStorage.removeItem("cocomama_chat_sessions");

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
          throw new Error(getApiErrorCode(sessionsBody, "chat_session_failed"));
        }

        if (isMounted) {
          const requestedSessionId = new URLSearchParams(
            window.location.search,
          ).get("sessionId");

          if (requestedSessionId) {
            const chatSessionResponse = await fetch(
              `/api/chat/sessions/${requestedSessionId}`,
              {
                cache: "no-store",
              },
            );
            const chatSessionBody = (await chatSessionResponse
              .json()
              .catch(() => null)) as ChatSessionApiResponse | null;

            if (chatSessionResponse.ok && chatSessionBody?.ok) {
              const session = chatSessionBody.data?.session;

              if (session) {
                setActiveSessionId(session.id);
                setActiveSessionTitle(session.title);
                setMessages(session.messages);
              }
            }
          }
        }
      } catch (error) {
        if (isMounted) {
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

    loadSessions();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const scrollPane = scrollPaneRef.current;
    if (!scrollPane) {
      return;
    }

    scrollPane.scrollTo({
      top: scrollPane.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isThinking]);

  useEffect(() => {
    if (!showSuggestions) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setActiveSuggestionIndex(
        (currentIndex) => (currentIndex + 1) % chatSuggestions.length,
      );
    }, 4200);

    return () => window.clearInterval(intervalId);
  }, [showSuggestions]);

  function clearPendingChatTimers() {
    if (thinkingTimeoutRef.current) {
      window.clearTimeout(thinkingTimeoutRef.current);
      thinkingTimeoutRef.current = null;
    }

    if (typingIntervalRef.current) {
      window.clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
  }

  function createLocalMessageId(prefix: string) {
    messageIdCounterRef.current += 1;

    return `${prefix}-${messageIdCounterRef.current}`;
  }

  function getVoicePlaybackController() {
    if (!voicePlaybackRef.current) {
      voicePlaybackRef.current = new VoicePlaybackController();
    }

    return voicePlaybackRef.current;
  }

  function stopVoicePlayback() {
    voiceTtsAbortControllerRef.current?.abort();
    voiceTtsAbortControllerRef.current = null;
    voicePlaybackRef.current?.stop();
  }

  function stopVoiceRecording(processRecording: boolean) {
    const recorder = voiceRecorderRef.current;

    voiceShouldProcessRecordingRef.current = processRecording;

    if (!recorder || recorder.state === "inactive") {
      if (!processRecording) {
        voiceAudioChunksRef.current = [];
      }
      return;
    }

    recorder.stop();
  }

  function releaseVoiceResources() {
    voiceIsListeningRef.current = false;
    voiceIsSpeakingRef.current = false;
    voiceShouldProcessRecordingRef.current = false;
    voiceSilenceStartedAtRef.current = null;
    voiceSpeechStartedAtRef.current = null;

    if (voiceAnimationFrameRef.current) {
      window.cancelAnimationFrame(voiceAnimationFrameRef.current);
      voiceAnimationFrameRef.current = null;
    }

    stopVoiceRecording(false);
    stopVoicePlayback();

    voiceRecorderRef.current = null;
    voiceAudioChunksRef.current = [];

    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
    voiceAnalyserRef.current = null;

    if (voiceAudioContextRef.current) {
      void voiceAudioContextRef.current.close().catch(() => null);
      voiceAudioContextRef.current = null;
    }
  }

  function stopVoiceConversation() {
    releaseVoiceResources();
    setVoiceStatus("idle");
    setVoiceTranscript("");
    setVoiceError("");
  }

  function getVoiceErrorMessage(error: unknown) {
    if (error instanceof DOMException) {
      if (error.name === "NotAllowedError") {
        return "Microphone permission was denied.";
      }

      if (error.name === "NotFoundError") {
        return "No microphone was found.";
      }

      if (error.name === "NotReadableError") {
        return "The microphone is already in use.";
      }
    }

    if (error instanceof Error) {
      return error.message;
    }

    return "Voice conversation failed.";
  }

  function interruptAssistantForVoiceInput() {
    stopVoicePlayback();

    if (isThinking || typingMessageId) {
      stopChatResponse();
    }
  }

  function startVoiceRecording() {
    const stream = voiceStreamRef.current;

    if (!stream || voiceRecorderRef.current?.state === "recording") {
      return;
    }

    const mimeType = getPreferredAudioMimeType();
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );

    voiceAudioChunksRef.current = [];
    voiceShouldProcessRecordingRef.current = false;

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        voiceAudioChunksRef.current.push(event.data);
      }
    });

    recorder.addEventListener("stop", () => {
      const shouldProcess = voiceShouldProcessRecordingRef.current;
      const audioChunks = voiceAudioChunksRef.current;

      voiceShouldProcessRecordingRef.current = false;
      voiceAudioChunksRef.current = [];

      if (voiceRecorderRef.current === recorder) {
        voiceRecorderRef.current = null;
      }

      if (!shouldProcess || audioChunks.length === 0) {
        return;
      }

      const audioBlob = new Blob(audioChunks, {
        type: recorder.mimeType || mimeType || "audio/webm",
      });

      void handleVoiceUtterance(audioBlob);
    });

    voiceRecorderRef.current = recorder;
    recorder.start(250);
  }

  function getCurrentVoiceLevel(analyser: AnalyserNode) {
    const samples = new Uint8Array(analyser.fftSize);
    let sumSquares = 0;

    analyser.getByteTimeDomainData(samples);

    for (const sample of samples) {
      const centeredSample = (sample - 128) / 128;

      sumSquares += centeredSample * centeredSample;
    }

    return Math.sqrt(sumSquares / samples.length);
  }

  function monitorVoiceActivity(now: number) {
    const analyser = voiceAnalyserRef.current;

    if (!voiceIsListeningRef.current || !analyser) {
      return;
    }

    const voiceLevel = getCurrentVoiceLevel(analyser);
    const speechThreshold = voiceIsSpeakingRef.current
      ? voiceStopRmsThreshold
      : voiceStartRmsThreshold;
    const hasSpeech = voiceLevel >= speechThreshold;

    if (hasSpeech) {
      voiceSilenceStartedAtRef.current = null;

      if (!voiceIsSpeakingRef.current) {
        voiceIsSpeakingRef.current = true;
        voiceSpeechStartedAtRef.current = now;
        setVoiceStatus("user_speaking");
        setVoiceError("");
        setVoiceTranscript("");
        interruptAssistantForVoiceInput();
        startVoiceRecording();
      }
    } else if (voiceIsSpeakingRef.current) {
      voiceSilenceStartedAtRef.current ??= now;

      const speechStartedAt = voiceSpeechStartedAtRef.current ?? now;
      const speechDurationMs = now - speechStartedAt;
      const silenceDurationMs = now - voiceSilenceStartedAtRef.current;
      const shouldEndUtterance =
        speechDurationMs >= voiceMinimumSpeechMs &&
        silenceDurationMs >= voiceSilenceEndDelayMs;

      if (shouldEndUtterance) {
        voiceIsSpeakingRef.current = false;
        voiceSilenceStartedAtRef.current = null;
        voiceSpeechStartedAtRef.current = null;
        setVoiceStatus("processing");
        stopVoiceRecording(true);
      }
    }

    if (voiceIsSpeakingRef.current && voiceSpeechStartedAtRef.current) {
      const speechDurationMs = now - voiceSpeechStartedAtRef.current;

      if (speechDurationMs >= voiceMaximumSpeechMs) {
        voiceIsSpeakingRef.current = false;
        voiceSilenceStartedAtRef.current = null;
        voiceSpeechStartedAtRef.current = null;
        setVoiceStatus("processing");
        stopVoiceRecording(true);
      }
    }

    voiceAnimationFrameRef.current =
      window.requestAnimationFrame(monitorVoiceActivity);
  }

  async function transcribeVoiceAudio(audioBlob: Blob) {
    if (audioBlob.size < voiceMinimumAudioBytes) {
      return "";
    }

    const audioBase64 = await blobToBase64(audioBlob);
    const response = await fetch("/api/voice/transcribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audioBase64,
        mimeType: audioBlob.type || "audio/webm",
      }),
    });
    const body = (await response
      .json()
      .catch(() => null)) as VoiceTranscriptionApiResponse | null;

    if (response.status === 401) {
      window.location.assign(
        `/login?next=${encodeURIComponent(window.location.pathname)}`,
      );
      return "";
    }

    if (!response.ok || !body?.ok || !body.data?.transcript) {
      throw new Error(body?.error?.message ?? "Voice transcription failed.");
    }

    return body.data.transcript.trim();
  }

  async function speakVoiceResponse(text: string) {
    stopVoicePlayback();

    const abortController = new AbortController();
    voiceTtsAbortControllerRef.current = abortController;
    setVoiceStatus("ai_speaking");

    try {
      const response = await fetch("/api/voice/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error("Voice playback could not be generated.");
      }

      if (abortController.signal.aborted || !voiceIsListeningRef.current) {
        return;
      }

      await getVoicePlaybackController().playResponse(response);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      throw error;
    } finally {
      if (voiceTtsAbortControllerRef.current === abortController) {
        voiceTtsAbortControllerRef.current = null;
      }
    }
  }

  async function handleVoiceUtterance(audioBlob: Blob) {
    if (!voiceIsListeningRef.current) {
      return;
    }

    if (audioBlob.size < voiceMinimumAudioBytes) {
      setVoiceStatus("listening");
      return;
    }

    setVoiceStatus("processing");
    setVoiceTranscript("Transcribing...");

    try {
      const transcript = await transcribeVoiceAudio(audioBlob);

      if (!voiceIsListeningRef.current) {
        return;
      }

      if (!transcript) {
        setVoiceStatus("listening");
        setVoiceTranscript("");
        return;
      }

      setVoiceTranscript(transcript);
      setVoiceStatus("ai_thinking");

      const chatResult = await sendChatMessage(transcript);

      if (!voiceIsListeningRef.current) {
        return;
      }

      if (!chatResult?.ok) {
        setVoiceStatus(chatResult?.aborted ? "listening" : "error");
        setVoiceError(chatResult?.error ?? "Voice chat failed.");
        return;
      }

      if (chatResult.toolCalls.length > 0) {
        setVoiceStatus("tool_running");
      }

      await speakVoiceResponse(chatResult.response);

      if (voiceIsListeningRef.current) {
        setVoiceStatus("listening");
        setVoiceTranscript("");
      }
    } catch (error) {
      if (!voiceIsListeningRef.current) {
        return;
      }

      setVoiceStatus("error");
      setVoiceError(getVoiceErrorMessage(error));
    }
  }

  async function startVoiceConversation() {
    if (voiceButtonDisabled || isVoiceActive) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceStatus("disconnected");
      setVoiceError("This browser does not support microphone capture.");
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setVoiceStatus("disconnected");
      setVoiceError("This browser does not support audio recording.");
      return;
    }

    releaseVoiceResources();
    setVoiceStatus("listening");
    setVoiceTranscript("");
    setVoiceError("");
    voiceIsListeningRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();

      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.2;
      source.connect(analyser);

      if (!voiceIsListeningRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        void audioContext.close().catch(() => null);
        return;
      }

      voiceStreamRef.current = stream;
      voiceAudioContextRef.current = audioContext;
      voiceAnalyserRef.current = analyser;
      voiceAnimationFrameRef.current =
        window.requestAnimationFrame(monitorVoiceActivity);
    } catch (error) {
      releaseVoiceResources();
      setVoiceStatus("error");
      setVoiceError(getVoiceErrorMessage(error));
    }
  }

  function toggleVoiceConversation() {
    if (isVoiceActive) {
      stopVoiceConversation();
      return;
    }

    void startVoiceConversation();
  }

  useEffect(() => {
    return () => {
      voiceIsListeningRef.current = false;
      voiceIsSpeakingRef.current = false;
      voiceShouldProcessRecordingRef.current = false;

      if (voiceAnimationFrameRef.current) {
        window.cancelAnimationFrame(voiceAnimationFrameRef.current);
      }

      const recorder = voiceRecorderRef.current;

      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }

      voiceTtsAbortControllerRef.current?.abort();
      voicePlaybackRef.current?.stop();
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
      void voiceAudioContextRef.current?.close().catch(() => null);
    };
  }, []);

  function handleModifiedChatSession(session: ChatSessionSummary) {
    setActiveSessionTitle(session.title);
  }

  function updateToolCallResult(
    messageId: string,
    toolCallIndex: number,
    result: FinancialRecordResult,
  ) {
    setMessages((currentMessages) =>
      currentMessages.map((message) => {
        if (message.id !== messageId || !message.toolCalls) {
          return message;
        }

        return {
          ...message,
          toolCalls: message.toolCalls.map((toolCall, index) =>
            index === toolCallIndex
              ? {
                  ...toolCall,
                  result: {
                    ...toolCall.result,
                    ...result,
                  },
                }
              : toolCall,
          ),
        };
      }),
    );
  }

  function startNewChat() {
    clearPendingChatTimers();
    stopVoiceConversation();
    setActiveSessionId(null);
    setActiveSessionTitle("New chat");
    setMessages([]);
    setDraft("");
    setIsThinking(false);
    setTypingMessageId(null);
    setIsHistoryOpen(false);
  }

  function handleEditMessage(content: string) {
    setDraft(content);
    window.setTimeout(() => {
      draftInputRef.current?.focus();
      draftInputRef.current?.select();
    }, 0);
  }

  function openManualTransactionModal() {
    setManualTransactionForm(createManualTransactionForm());
    setManualTransactionError("");
    setIsManualMenuOpen(false);
    setIsManualModalOpen(true);
  }

  useEffect(() => {
    const draftInput = draftInputRef.current;

    if (!draftInput) {
      return;
    }

    draftInput.style.height = "auto";
    const nextHeight = Math.min(draftInput.scrollHeight, chatInputMaxHeightPx);
    draftInput.style.height = `${nextHeight}px`;
    draftInput.style.overflowY =
      draftInput.scrollHeight > chatInputMaxHeightPx ? "auto" : "hidden";
  }, [draft]);

  async function handleManualTransactionSubmit() {
    const amount = Number(manualTransactionForm.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setManualTransactionError("Enter a valid amount.");
      return;
    }

    if (!manualTransactionForm.description.trim()) {
      setManualTransactionError("Enter a description.");
      return;
    }

    if (!manualTransactionForm.category.trim()) {
      setManualTransactionError("Enter a category.");
      return;
    }

    setIsSavingManualTransaction(true);
    setManualTransactionError("");

    try {
      const response = await fetch("/api/app/records/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: manualTransactionForm.type,
          amount,
          currency: manualTransactionForm.currency,
          category: manualTransactionForm.category.trim(),
          description: manualTransactionForm.description.trim(),
          merchant: manualTransactionForm.merchant.trim() || undefined,
          isRecurring: manualTransactionForm.isRecurring,
          occurredAt: toIsoDateTime(manualTransactionForm.occurredAt),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        record?: FinancialRecordResult;
        toolCall?: ChatToolCallSummary;
        error?: string;
        message?: string;
        availableCategories?: string[];
      } | null;

      if (!response.ok || !body?.record || !body.toolCall) {
        throw new Error(
          body?.message ?? body?.error ?? "manual_transaction_failed",
        );
      }

      const assistantMessage: ChatMessage = {
        id: createLocalMessageId("assistant-manual"),
        role: "assistant",
        content: "Transaction saved.",
        toolCalls: [body.toolCall],
      };

      setMessages((currentMessages) => [...currentMessages, assistantMessage]);
      setIsManualModalOpen(false);
      setManualTransactionForm(createManualTransactionForm());
    } catch (error) {
      setManualTransactionError(
        error instanceof Error
          ? error.message
          : "Could not save this transaction.",
      );
    } finally {
      setIsSavingManualTransaction(false);
    }
  }

  async function loadChatSession(sessionId: string) {
    if (loadingSessionId === sessionId) {
      return;
    }

    clearPendingChatTimers();
    setLoadingSessionId(sessionId);
    setHistoryError("");
    setIsThinking(false);
    setTypingMessageId(null);

    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}`, {
        cache: "no-store",
      });
      const body = (await response
        .json()
        .catch(() => null)) as ChatSessionApiResponse | null;

      if (!response.ok || !body?.ok || !body.data?.session) {
        throw new Error("chat_session_failed");
      }

      const session = body.data.session;

      setActiveSessionId(session.id);
      setActiveSessionTitle(session.title);
      setMessages(session.messages);
      setIsHistoryOpen(false);
    } catch {
      setHistoryError("That chat could not be opened.");
    } finally {
      setLoadingSessionId(null);
    }
  }

  function typeAssistantReply(
    content: string,
    isError = false,
    excludedFromAi = false,
    toolCalls: ChatToolCallSummary[] = [],
  ) {
    clearPendingChatTimers();

    const assistantMessageId = createLocalMessageId("assistant");
    let characterIndex = 0;
    const intervalMs = 18;
    const targetDurationMs = Math.min(
      1200,
      Math.max(260, Math.round(content.length * 2.2)),
    );
    const totalFrames = Math.max(1, Math.ceil(targetDurationMs / intervalMs));
    const charactersPerFrame = Math.max(
      1,
      Math.ceil(content.length / totalFrames),
    );

    setIsThinking(false);
    setTypingMessageId(assistantMessageId);
    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        toolCalls,
        isError,
        excludedFromAi,
      },
    ]);

    typingIntervalRef.current = window.setInterval(() => {
      characterIndex = Math.min(
        content.length,
        characterIndex + charactersPerFrame,
      );
      const nextContent = content.slice(0, characterIndex);

      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === assistantMessageId
            ? { ...message, content: nextContent }
            : message,
        ),
      );

      if (characterIndex >= content.length) {
        if (typingIntervalRef.current) {
          window.clearInterval(typingIntervalRef.current);
        }
        typingIntervalRef.current = null;
        setTypingMessageId(null);
      }
    }, 16);
  }

  async function sendChatMessage(
    messageText: string,
  ): Promise<SendChatMessageResult | null> {
    if (!messageText || isThinking || typingMessageId) {
      return null;
    }

    const abortController = new AbortController();
    chatAbortControllerRef.current = abortController;

    const userMessage: ChatMessage = {
      id: createLocalMessageId("user"),
      role: "user",
      content: messageText,
    };
    const nextMessages = [...messages, userMessage];

    setMessages((currentMessages) => [...currentMessages, userMessage]);
    setDraft("");
    setShowAiDisclaimer(false);
    localStorage.setItem(aiDisclaimerDismissedStorageKey, "1");
    setIsThinking(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: messageText,
          conversationId: activeSessionId ?? undefined,
        }),
        signal: abortController.signal,
      });
      const body = (await response
        .json()
        .catch(() => null)) as ChatApiResponse | null;

      if (!response.ok || !body?.ok || !body.data) {
        throw new Error(getApiErrorCode(body, "chat_failed"));
      }

      const sessionSummary =
        body.data.session ??
        ({
          id: body.data.conversationId,
          title:
            activeSessionId && activeSessionTitle !== "New chat"
              ? activeSessionTitle
              : createSessionTitle(messageText),
          titleStatus: "fallback",
          titleModel: null,
          messageCount: nextMessages.length + 1,
          lastMessageAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } satisfies ChatSessionSummary);

      setActiveSessionId(body.data.conversationId);
      setActiveSessionTitle(sessionSummary.title);
      handleModifiedChatSession(sessionSummary);
      const toolCalls = body.data.toolCalls ?? [];

      typeAssistantReply(body.data.response, false, false, toolCalls);

      return {
        ok: true,
        response: body.data.response,
        toolCalls,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setIsThinking(false);
        return { ok: false, aborted: true };
      }

      if (error instanceof Error && error.message === "unauthorized") {
        window.location.assign(
          `/login?next=${encodeURIComponent(window.location.pathname)}`,
        );
        return { ok: false, error: "unauthorized" };
      }

      const errorMessage = getChatErrorMessage(error);

      typeAssistantReply(errorMessage, true, true);

      return { ok: false, error: errorMessage };
    } finally {
      if (chatAbortControllerRef.current === abortController) {
        chatAbortControllerRef.current = null;
      }
    }
  }

  function addStoppedResponseMessage() {
    const stoppedMessage: ChatMessage = {
      id: createLocalMessageId("assistant-stopped"),
      role: "assistant",
      content: "Query stopped.",
      excludedFromAi: true,
    };

    setMessages((currentMessages) => [...currentMessages, stoppedMessage]);
  }

  function stopChatResponse() {
    stopVoicePlayback();
    chatAbortControllerRef.current?.abort();
    chatAbortControllerRef.current = null;
    setIsThinking(false);

    if (typingIntervalRef.current) {
      window.clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }

    setTypingMessageId(null);
    addStoppedResponseMessage();
  }

  function closeChat() {
    stopVoiceConversation();
    stopVoicePlayback();
    chatAbortControllerRef.current?.abort();
    chatAbortControllerRef.current = null;
    clearPendingChatTimers();
    setIsThinking(false);
    setTypingMessageId(null);

    try {
      const referrer = document.referrer ? new URL(document.referrer) : null;

      if (
        referrer?.origin === window.location.origin &&
        referrer.pathname !== window.location.pathname
      ) {
        window.history.back();
        return;
      }
    } catch {
      // Fall back below when the referrer cannot be parsed.
    }

    window.location.assign("/transactions");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await sendChatMessage(draft.trim());
  }

  const canStopChatResponse = isThinking || Boolean(typingMessageId);
  const showVoiceStatus =
    isVoiceActive || voiceStatus === "error" || voiceStatus === "disconnected";
  const voiceStatusDetail = voiceError || voiceTranscript;

  async function dismissBudgetNotification(notificationId: string) {
    setBudgetNotifications((currentNotifications) =>
      currentNotifications.filter(({ id }) => id !== notificationId),
    );
    await fetch(`/api/app/budget-notifications/${notificationId}/dismiss`, {
      method: "POST",
    }).catch(() => null);
  }

  return (
    <main className="h-dvh overflow-hidden bg-background text-text">
      <AnimatePresence>
        {budgetNotifications.length > 0 ? (
          <motion.div
            className="fixed right-4 top-20 z-50 grid w-[min(22rem,calc(100vw-2rem))] gap-2"
            aria-live="polite"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {budgetNotifications.map((notification) => (
              <motion.article
                key={notification.id}
                className="rounded-lg border border-primary/20 bg-surface p-3 text-sm shadow-lg"
                layout
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-text">
                      {notification.title}
                    </p>
                    <p className="mt-1 leading-5 text-text-muted">
                      {notification.body}
                    </p>
                  </div>
                  <button
                    className="grid size-7 shrink-0 place-items-center rounded-md text-text-muted transition hover:bg-surface-muted hover:text-text"
                    type="button"
                    aria-label="Dismiss budget notification"
                    onClick={() => dismissBudgetNotification(notification.id)}
                  >
                    <X
                      className="size-4"
                      strokeWidth={1.9}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </motion.article>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="flex h-full min-h-0 w-full">
        <AnimatePresence>
          {isManualModalOpen ? (
            <ManualTransactionModal
              form={manualTransactionForm}
              error={manualTransactionError}
              isSaving={isSavingManualTransaction}
              onChange={setManualTransactionForm}
              onClose={() => setIsManualModalOpen(false)}
              onSubmit={handleManualTransactionSubmit}
            />
          ) : null}
        </AnimatePresence>
        <AppSideNavigation
          activeItem="Chat"
          activeSessionId={activeSessionId}
          isOpen={isHistoryOpen}
          loadingSessionId={loadingSessionId}
          onClose={() => setIsHistoryOpen(false)}
          onNewChat={startNewChat}
          onSelectChatSession={loadChatSession}
        />

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="z-20 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur lg:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <motion.button
                className="hidden size-10 place-items-center rounded-md border border-border bg-surface text-text-muted transition hover:text-text lg:grid"
                type="button"
                aria-label="Open chat history"
                aria-controls="mobile-chat-history"
                aria-expanded={isHistoryOpen}
                onClick={() => setIsHistoryOpen(true)}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
              >
                <Menu className="size-5" strokeWidth={1.8} aria-hidden="true" />
              </motion.button>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">Cocobaa</p>
                <p className="truncate text-xs text-text-soft">
                  {isLoadingSessions || loadingSessionId
                    ? "Loading chat"
                    : activeSessionTitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isLoadingSessions ? (
                <SkeletonBlock className="hidden h-6 w-20 rounded-full sm:block" />
              ) : (
                <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 sm:inline-flex">
                  On track
                </span>
              )}
              <motion.button
                className="grid size-10 place-items-center rounded-md border border-border bg-surface text-text-muted transition hover:bg-surface-muted hover:text-text"
                type="button"
                aria-label="Close chat"
                title="Close chat"
                onClick={closeChat}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
              >
                <X className="size-5" strokeWidth={1.9} aria-hidden="true" />
              </motion.button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 w-full min-w-0 flex-col">
              {isLoadingSessions ? (
                <ChatPageSkeleton />
              ) : (
                <>
                  <div
                    ref={scrollPaneRef}
                    className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-5 sm:px-6 lg:pt-8"
                  >
                    <div
                      className={`mx-auto flex min-h-full w-full max-w-3xl flex-col ${
                        showSuggestions ? "justify-center" : ""
                      }`}
                    >
                      <AnimatePresence mode="wait">
                        {showSuggestions ? (
                          <motion.section
                            key="chat-suggestions"
                            className="mx-auto grid w-full max-w-2xl place-items-center px-2 py-16 text-center"
                            aria-label="Suggested chat prompts"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                          >
                            <p className="text-sm font-medium text-text-soft">
                              Try asking Cocobaa
                            </p>
                            <AnimatePresence mode="wait">
                              <motion.button
                                key={chatSuggestions[activeSuggestionIndex]}
                                className="mt-3 max-w-full rounded-md px-3 py-2 text-base font-medium leading-7 text-text-muted transition hover:bg-surface-muted hover:text-text sm:text-lg"
                                type="button"
                                onClick={() =>
                                  setDraft(
                                    chatSuggestions[activeSuggestionIndex],
                                  )
                                }
                                initial={{
                                  opacity: 0,
                                  y: 8,
                                  filter: "blur(3px)",
                                }}
                                animate={{
                                  opacity: 1,
                                  y: 0,
                                  filter: "blur(0px)",
                                }}
                                exit={{
                                  opacity: 0,
                                  y: -8,
                                  filter: "blur(3px)",
                                }}
                                transition={{
                                  duration: 0.46,
                                  ease: "easeOut",
                                }}
                                whileHover={{ y: -1 }}
                                whileTap={{ scale: 0.98 }}
                              >
                                {chatSuggestions[activeSuggestionIndex]}
                              </motion.button>
                            </AnimatePresence>
                          </motion.section>
                        ) : null}
                      </AnimatePresence>

                      <div
                        className="space-y-6"
                        aria-label="Chat conversation"
                        aria-live="polite"
                      >
                        <AnimatePresence initial={false} mode="popLayout">
                          {messages.map((message) => {
                            return (
                              <ChatMessageRow
                                key={message.id}
                                message={message}
                                isTyping={typingMessageId === message.id}
                                showActions={
                                  message.id === latestAssistantMessageId
                                }
                                onToolResultUpdate={updateToolCallResult}
                                onFeedbackSubmit={sendChatMessage}
                                onEditMessage={handleEditMessage}
                              />
                            );
                          })}
                          {isThinking ? (
                            <ThinkingMessage key="thinking" />
                          ) : null}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 border-t border-border bg-background/96 px-4 py-3 backdrop-blur">
                    {showAiDisclaimer ? (
                      <p className="mx-auto mb-2 max-w-3xl px-1 text-center text-xs leading-5 text-text-soft">
                        AI can make mistakes. Review important finance details.
                      </p>
                    ) : null}
                    <AnimatePresence>
                      {showVoiceStatus ? (
                        <motion.div
                          className="mx-auto mb-2 flex max-w-3xl items-center gap-3 rounded-lg border border-primary/15 bg-surface px-3 py-2 text-sm shadow-sm"
                          aria-live="polite"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 6 }}
                          transition={{ duration: 0.16, ease: "easeOut" }}
                        >
                          <span
                            className={`grid size-9 shrink-0 place-items-center rounded-md ${
                              voiceStatus === "error" ||
                              voiceStatus === "disconnected"
                                ? "bg-danger/10 text-danger"
                                : "bg-primary/10 text-primary"
                            }`}
                            aria-hidden="true"
                          >
                            <AudioWaveform
                              className={`size-4 ${
                                voiceStatus === "listening" ||
                                voiceStatus === "user_speaking" ||
                                voiceStatus === "ai_speaking"
                                  ? "motion-safe:animate-pulse"
                                  : ""
                              }`}
                              strokeWidth={1.9}
                            />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-text">
                              {voiceStatusLabels[voiceStatus]}
                            </p>
                            {voiceStatusDetail ? (
                              <p className="truncate text-xs leading-5 text-text-soft">
                                {voiceStatusDetail}
                              </p>
                            ) : null}
                          </div>
                          {isVoiceActive ? (
                            <button
                              className="grid size-8 shrink-0 place-items-center rounded-md text-text-muted transition hover:bg-surface-muted hover:text-text"
                              type="button"
                              aria-label="Stop voice conversation"
                              onClick={stopVoiceConversation}
                            >
                              <X
                                className="size-4"
                                strokeWidth={1.9}
                                aria-hidden="true"
                              />
                            </button>
                          ) : null}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                    <form
                      className="relative mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-border bg-surface p-2 shadow-[0_8px_24px_rgba(15,23,42,0.055)]"
                      onSubmit={handleSubmit}
                    >
                      <AnimatePresence>
                        {isManualMenuOpen ? (
                          <motion.div
                            className="absolute bottom-[calc(100%+0.75rem)] left-0 right-0 z-40 rounded-xl border border-border bg-surface p-2 text-sm"
                            initial={{ opacity: 0, y: 8, scale: 0.99 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 6, scale: 0.99 }}
                            transition={{ duration: 0.16, ease: "easeOut" }}
                          >
                            <button
                              className="group flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border border-primary/15 bg-primary/8 px-3 py-2 text-left transition hover:border-primary/30 hover:bg-primary/12"
                              type="button"
                              onClick={openManualTransactionModal}
                            >
                              <span className="flex min-w-0 items-center gap-3">
                                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface text-primary ring-1 ring-primary/15">
                                  <CircleDollarSign
                                    className="size-4"
                                    strokeWidth={1.9}
                                    aria-hidden="true"
                                  />
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold text-text">
                                    Add new transaction
                                  </span>
                                  <span className="block truncate text-xs leading-4 text-text-soft">
                                    Manual entry with editable saved card
                                  </span>
                                </span>
                              </span>
                              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface text-primary ring-1 ring-border transition group-hover:ring-primary/25">
                                <Plus
                                  className="size-4"
                                  strokeWidth={1.9}
                                  aria-hidden="true"
                                />
                              </span>
                            </button>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>

                      <div className="shrink-0">
                        <motion.button
                          className="grid size-10 place-items-center rounded-md text-xl text-text-muted transition hover:bg-surface-muted hover:text-text"
                          type="button"
                          aria-label="Add files and more"
                          aria-expanded={isManualMenuOpen}
                          onClick={() =>
                            setIsManualMenuOpen((current) => !current)
                          }
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.94 }}
                        >
                          <Plus
                            className="size-5"
                            strokeWidth={1.8}
                            aria-hidden="true"
                          />
                        </motion.button>
                      </div>
                      <label htmlFor="message" className="sr-only">
                        Message Cocobaa
                      </label>
                      <textarea
                        ref={draftInputRef}
                        id="message"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                          }
                        }}
                        className="max-h-28 min-h-10 flex-1 resize-none overflow-hidden bg-transparent px-2 py-2 text-base leading-6 text-text outline-none placeholder:text-text-soft"
                        placeholder="Ask about spending, add an expense, or plan a purchase"
                        rows={1}
                      />
                      <motion.button
                        className={`grid size-10 shrink-0 place-items-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-45 ${
                          isVoiceActive
                            ? "bg-primary text-white hover:bg-primary/90"
                            : voiceStatus === "error" ||
                                voiceStatus === "disconnected"
                              ? "bg-danger/10 text-danger hover:bg-danger/15"
                              : "text-text-muted hover:bg-surface-muted hover:text-text"
                        }`}
                        type="button"
                        aria-label={
                          isVoiceActive
                            ? "Stop voice conversation"
                            : "Start voice conversation"
                        }
                        aria-pressed={isVoiceActive}
                        disabled={voiceButtonDisabled}
                        onClick={toggleVoiceConversation}
                        whileHover={voiceButtonDisabled ? undefined : { y: -1 }}
                        whileTap={
                          voiceButtonDisabled ? undefined : { scale: 0.97 }
                        }
                      >
                        {voiceStatus === "error" ||
                        voiceStatus === "disconnected" ? (
                          <MicOff
                            className="size-5"
                            strokeWidth={1.9}
                            aria-hidden="true"
                          />
                        ) : isVoiceActive ? (
                          <AudioWaveform
                            className="size-5 motion-safe:animate-pulse"
                            strokeWidth={1.9}
                            aria-hidden="true"
                          />
                        ) : (
                          <Mic
                            className="size-5"
                            strokeWidth={1.9}
                            aria-hidden="true"
                          />
                        )}
                      </motion.button>
                      <motion.button
                        className={`grid size-10 shrink-0 place-items-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-45 ${
                          canStopChatResponse
                            ? "bg-danger text-white hover:bg-danger/90"
                            : "bg-text text-surface hover:bg-slate-700"
                        }`}
                        type={canStopChatResponse ? "button" : "submit"}
                        aria-label={
                          canStopChatResponse ? "Stop response" : "Send message"
                        }
                        disabled={!canStopChatResponse && !draft.trim()}
                        onClick={
                          canStopChatResponse ? stopChatResponse : undefined
                        }
                        whileHover={
                          canStopChatResponse || draft.trim()
                            ? { y: -1 }
                            : undefined
                        }
                        whileTap={
                          canStopChatResponse || draft.trim()
                            ? { scale: 0.97 }
                            : undefined
                        }
                      >
                        {canStopChatResponse ? (
                          <X
                            className="size-5"
                            strokeWidth={1.9}
                            aria-hidden="true"
                          />
                        ) : (
                          <SendHorizontal
                            className="size-5"
                            strokeWidth={1.9}
                            aria-hidden="true"
                          />
                        )}
                      </motion.button>
                    </form>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
