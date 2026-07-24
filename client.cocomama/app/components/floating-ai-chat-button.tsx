"use client";

import { motion } from "framer-motion";
import { Plus, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";

const hiddenPathPrefixes = [
  "/chat",
  "/login",
  "/signin",
  "/onboarding",
  "/welcome",
];

export function FloatingAiChatButton() {
  const pathname = usePathname();

  if (
    pathname === "/" ||
    hiddenPathPrefixes.some((path) => pathname.startsWith(path))
  ) {
    return null;
  }

  return (
    <motion.a
      href="/chat"
      className="fixed bottom-6 right-6 z-40 hidden size-13 place-items-center rounded-full border border-primary/20 bg-surface/95 text-primary shadow-[0_10px_24px_rgba(15,23,42,0.09)] backdrop-blur transition hover:border-primary/35 hover:bg-surface hover:text-primary/85 focus:outline-none focus:ring-2 focus:ring-primary/30 lg:grid"
      aria-label="Open AI chat"
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
    >
      <span className="relative grid size-10 place-items-center">
        <Sparkles
          className="size-7 drop-shadow-sm"
          strokeWidth={1.8}
          aria-hidden="true"
        />
        <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-primary text-surface ring-2 ring-background">
          <Plus className="size-3" strokeWidth={2.2} aria-hidden="true" />
        </span>
      </span>
    </motion.a>
  );
}
