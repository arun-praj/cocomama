"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  BellRing,
  BrainCircuit,
  CircleDollarSign,
  MessageSquareText,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const features = [
  {
    title: "Chat-first budgeting",
    description:
      "Ask Cocobaa about spending, budgets, bills, and purchase decisions in plain language.",
    icon: MessageSquareText,
  },
  {
    title: "AI recommendations",
    description:
      "Get practical answers that consider your category budget, bills, goals, and past spending.",
    icon: BrainCircuit,
  },
  {
    title: "Family support",
    description:
      "Track shared household expenses while keeping private chat history private to each user.",
    icon: UsersRound,
  },
  {
    title: "Budget guardrails",
    description:
      "See when categories are healthy, near limit, or over budget before spending decisions happen.",
    icon: CircleDollarSign,
  },
  {
    title: "Smart reminders",
    description:
      "Plan for daily spending reminders, weekly summaries, goal progress, and budget alerts.",
    icon: BellRing,
  },
  {
    title: "Recoverable AI actions",
    description:
      "AI-created records are transparent and designed with undo, edit, and audit trails.",
    icon: ShieldCheck,
  },
];

function WelcomeContent() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  const homePath =
    nextPath?.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";

  return (
    <main className="min-h-dvh bg-background text-text">
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex h-12 shrink-0 items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-text">
            <span className="grid size-8 place-items-center rounded-md border border-border bg-surface text-sm font-bold">
              C
            </span>
            Cocobaa
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
            Setup complete
          </span>
        </header>

        <section className="flex flex-1 flex-col justify-center py-10">
          <motion.div
            className="mx-auto max-w-3xl text-center"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <motion.div
              className="mx-auto mb-5 grid size-12 place-items-center rounded-xl bg-text text-surface shadow-sm"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.08, duration: 0.24, ease: "easeOut" }}
            >
              <ShieldCheck
                className="size-6"
                strokeWidth={1.9}
                aria-hidden="true"
              />
            </motion.div>
            <p className="text-sm font-medium text-text-soft">You are ready</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight text-text sm:text-4xl">
              Cocobaa is set up for your first money conversation.
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-text-muted">
              Here is what you can do next. The app starts with chat, but every
              answer is grounded in your budget, family context, and financial
              goals.
            </p>
          </motion.div>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => {
              const Icon = feature.icon;

              return (
                <motion.article
                  key={feature.title}
                  className="rounded-lg border border-border bg-surface p-4 shadow-sm"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.16 + index * 0.045,
                    duration: 0.22,
                    ease: "easeOut",
                  }}
                >
                  <div className="mb-3 grid size-9 place-items-center rounded-lg bg-surface-muted text-primary">
                    <Icon
                      className="size-5"
                      strokeWidth={1.9}
                      aria-hidden="true"
                    />
                  </div>
                  <h2 className="text-base font-semibold text-text">
                    {feature.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-text-muted">
                    {feature.description}
                  </p>
                </motion.article>
              );
            })}
          </div>

          <motion.div
            className="mt-10 flex justify-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.48, duration: 0.22, ease: "easeOut" }}
          >
            <Link
              href={homePath}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-text px-5 text-sm font-semibold text-surface transition hover:bg-slate-700"
            >
              Let&apos;s Start
              <ArrowRight
                className="size-4"
                strokeWidth={1.9}
                aria-hidden="true"
              />
            </Link>
          </motion.div>
        </section>
      </div>
    </main>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <WelcomeContent />
    </Suspense>
  );
}
