"use client";

import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  LineChart,
  Menu,
  PieChart,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { AppSideNavigation } from "../components/app-side-navigation";

const analyticsCards = [
  {
    title: "Money movement",
    description: "Track monthly net flow across income, expenses, and savings.",
    Icon: LineChart,
  },
  {
    title: "Category mix",
    description: "Compare where spending clusters by category and merchant.",
    Icon: PieChart,
  },
  {
    title: "Momentum",
    description: "Spot improving or worsening trends before they surprise you.",
    Icon: TrendingUp,
  },
];

export default function AnalyticsPage() {
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);

  return (
    <main className="h-dvh overflow-hidden bg-background text-text">
      <div className="flex h-full min-h-0 w-full">
        <AppSideNavigation
          activeItem="Analytics"
          isOpen={isNavigationOpen}
          onClose={() => setIsNavigationOpen(false)}
        />

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="z-20 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur lg:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <motion.button
                className="hidden size-10 place-items-center rounded-md border border-border bg-surface text-text-muted transition hover:text-text lg:grid"
                type="button"
                aria-label="Open navigation"
                onClick={() => setIsNavigationOpen(true)}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
              >
                <Menu className="size-5" strokeWidth={1.8} aria-hidden="true" />
              </motion.button>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">Analytics</p>
                <p className="truncate text-xs text-text-soft">
                  Patterns, categories, and money movement
                </p>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto bg-background py-4 sm:bg-[radial-gradient(circle_at_88%_8%,rgba(36,92,87,0.08),transparent_28%),radial-gradient(circle_at_4%_92%,rgba(36,99,166,0.06),transparent_26%)]">
            <div className="mx-auto grid w-full max-w-5xl gap-3 px-3 pb-28 sm:px-6 lg:px-8 lg:pb-8">
              <motion.section
                className="rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, ease: "easeOut" }}
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <BarChart3
                      className="size-5"
                      strokeWidth={1.9}
                      aria-hidden="true"
                    />
                  </span>
                  <div className="min-w-0">
                    <h1 className="text-2xl font-semibold leading-tight text-text sm:text-3xl">
                      Analytics
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
                      A focused surface for money insights. The page shell is ready for charts as data views mature.
                    </p>
                  </div>
                </div>
              </motion.section>

              <div className="grid gap-3 sm:grid-cols-3">
                {analyticsCards.map((card, index) => (
                  <motion.article
                    key={card.title}
                    className="rounded-xl border border-border bg-surface p-4 shadow-sm"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.04 + index * 0.03,
                      duration: 0.22,
                      ease: "easeOut",
                    }}
                  >
                    <span className="grid size-10 place-items-center rounded-lg bg-surface-muted text-primary">
                      <card.Icon
                        className="size-5"
                        strokeWidth={1.9}
                        aria-hidden="true"
                      />
                    </span>
                    <h2 className="mt-4 text-base font-semibold text-text">
                      {card.title}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-text-muted">
                      {card.description}
                    </p>
                  </motion.article>
                ))}
              </div>

              <motion.section
                className="rounded-xl border border-dashed border-border bg-surface/70 p-5 text-sm leading-6 text-text-muted"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14, duration: 0.22, ease: "easeOut" }}
              >
                <div className="flex items-start gap-3">
                  <Activity
                    className="mt-0.5 size-5 shrink-0 text-primary"
                    strokeWidth={1.9}
                    aria-hidden="true"
                  />
                  <p>
                    Upcoming analytics can plug into the existing monthly, weekly, yearly, and custom date range transaction APIs.
                  </p>
                </div>
              </motion.section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}