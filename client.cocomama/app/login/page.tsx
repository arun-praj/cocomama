"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  KeyRound,
  LoaderCircle,
  Mail,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { authClient } from "../../lib/auth-client";

type AuthMode = "otp" | "magic";
type AuthStatus = "idle" | "sending" | "sent" | "verifying" | "verified";

const emailSchema = z.string().trim().email("Enter a valid email address.");
const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6 digit code from your email.");

const configuredOtpExpirySeconds = Number.parseInt(
  process.env.NEXT_PUBLIC_EMAIL_OTP_EXPIRES_IN_SECONDS ?? "300",
  10,
);
const otpExpiryDurationSeconds = Number.isFinite(configuredOtpExpirySeconds)
  ? Math.max(60, configuredOtpExpirySeconds)
  : 300;
const resendCooldownSeconds = 30;

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function ValidationAlert({
  id,
  title,
  message,
}: {
  id?: string;
  title: string;
  message: string;
}) {
  return (
    <motion.div
      id={id}
      role="alert"
      className="flex gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-left text-sm text-red-900"
      initial={{ opacity: 0, y: 6, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.99 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <CircleAlert
        className="mt-0.5 size-4 shrink-0 text-danger"
        strokeWidth={1.9}
        aria-hidden="true"
      />
      <span>
        <span className="block font-semibold text-text">{title}</span>
        <span className="mt-1 block leading-6 text-red-800">{message}</span>
      </span>
    </motion.div>
  );
}

function getFriendlyAuthError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const normalizedMessage = message.toLowerCase().replaceAll("_", " ");

  if (normalizedMessage.includes("invalid otp")) {
    return "The code is incorrect or no longer valid. Use the latest email and try again.";
  }

  if (normalizedMessage.includes("expired")) {
    return "That code has expired. Send a new code and use the latest email.";
  }

  if (normalizedMessage.includes("rate")) {
    return "Too many attempts. Wait a moment before requesting another code.";
  }

  return message || fallback;
}

function getRedirectPath() {
  const nextPath = new URLSearchParams(window.location.search).get("next");

  if (nextPath?.startsWith("/") && !nextPath.startsWith("//")) {
    return nextPath;
  }

  return "/";
}

function getRedirectUrl() {
  return `${window.location.origin}${getRedirectPath()}`;
}

function getOnboardingRedirectUrl() {
  const nextPath = getRedirectPath();
  const onboardingUrl = new URL("/onboarding", window.location.origin);

  if (nextPath !== "/") {
    onboardingUrl.searchParams.set("next", nextPath);
  }

  return onboardingUrl.toString();
}

function throwAuthClientError(
  error: { code?: string; message?: string } | null | undefined,
  fallback: string,
) {
  if (error) {
    throw new Error(error.code ?? error.message ?? fallback);
  }
}

function waitForBackendSessionRetry() {
  return new Promise((resolve) => window.setTimeout(resolve, 250));
}

async function getBackendUser() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await fetch("/api/app/me", {
      cache: "no-store",
      credentials: "include",
    });
    const body = (await response.json().catch(() => null)) as {
      user?: {
        email?: string;
        onboardingCompleted?: boolean;
      };
    } | null;

    if (response.ok && body?.user) {
      return body.user;
    }

    await waitForBackendSessionRetry();
  }

  throw new Error("Backend session was not established. Try signing in again.");
}

async function clearBackendSession() {
  await fetch("/api/auth/sign-out", {
    method: "POST",
    credentials: "include",
  }).catch(() => null);
}

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("magic");
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [emailError, setEmailError] = useState("");
  const [otpError, setOtpError] = useState("");
  const [authError, setAuthError] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [otpSecondsRemaining, setOtpSecondsRemaining] = useState(0);
  const [resendSecondsRemaining, setResendSecondsRemaining] = useState(0);
  const [isResendingCode, setIsResendingCode] = useState(false);
  const otpFormRef = useRef<HTMLFormElement | null>(null);
  const otpInputRef = useRef<HTMLInputElement | null>(null);
  const lastAutoSubmittedOtpRef = useRef("");

  const isBusy =
    status === "sending" || status === "verifying" || isResendingCode;
  const isOtpStep =
    mode === "otp" &&
    (status === "sent" || status === "verifying" || status === "verified");
  const isOtpExpired =
    isOtpStep && status !== "verified" && otpSecondsRemaining === 0;

  useEffect(() => {
    if (!isOtpStep || status === "verified") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setOtpSecondsRemaining((currentSeconds) =>
        Math.max(0, currentSeconds - 1),
      );
      setResendSecondsRemaining((currentSeconds) =>
        Math.max(0, currentSeconds - 1),
      );
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isOtpStep, status]);

  useEffect(() => {
    if (
      !isOtpStep ||
      status !== "sent" ||
      isOtpExpired ||
      otp.length !== 6 ||
      lastAutoSubmittedOtpRef.current === otp
    ) {
      return;
    }

    lastAutoSubmittedOtpRef.current = otp;
    otpFormRef.current?.requestSubmit();
  }, [isOtpExpired, isOtpStep, otp, status]);

  function resetOtpTimers() {
    setOtpSecondsRemaining(otpExpiryDurationSeconds);
    setResendSecondsRemaining(resendCooldownSeconds);
    lastAutoSubmittedOtpRef.current = "";
  }

  function clearOtpTimers() {
    setOtpSecondsRemaining(0);
    setResendSecondsRemaining(0);
    setIsResendingCode(false);
    lastAutoSubmittedOtpRef.current = "";
  }

  function handleModeChange(nextMode: AuthMode) {
    if (isBusy) {
      return;
    }

    setMode(nextMode);
    setStatus("idle");
    setOtp("");
    setEmailError("");
    setOtpError("");
    setAuthError("");
    clearOtpTimers();
  }

  function handleBackToSignIn() {
    if (isBusy) {
      return;
    }

    setStatus("idle");
    setOtp("");
    setOtpError("");
    setAuthError("");
    clearOtpTimers();
  }

  async function completeSignIn(normalizedEmail: string) {
    const user = await getBackendUser();

    setVerifiedEmail(user?.email ?? normalizedEmail);
    setStatus("verified");

    window.setTimeout(() => {
      window.location.assign(
        user?.onboardingCompleted
          ? getRedirectPath()
          : getOnboardingRedirectUrl(),
      );
    }, 500);
  }

  async function handleRequestAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedEmail = emailSchema.safeParse(email);
    if (!parsedEmail.success) {
      setEmailError(
        parsedEmail.error.issues[0]?.message ?? "Enter a valid email address.",
      );
      return;
    }

    setEmailError("");
    setOtpError("");
    setAuthError("");
    setStatus("sending");

    try {
      const normalizedEmail = parsedEmail.data.toLowerCase();

      setEmail(normalizedEmail);
      await clearBackendSession();

      if (mode === "otp") {
        const { error } = await authClient.emailOtp.sendVerificationOtp({
          email: normalizedEmail,
          type: "sign-in",
        });

        throwAuthClientError(error, "Could not send verification code.");
        setOtp("");
        resetOtpTimers();
        setStatus("sent");
        return;
      }

      const { error } = await authClient.signIn.magicLink({
        email: normalizedEmail,
        name: normalizedEmail.split("@")[0] || "Cocomama member",
        callbackURL: getRedirectUrl(),
        newUserCallbackURL: getOnboardingRedirectUrl(),
        errorCallbackURL: `${window.location.origin}/login`,
      });

      throwAuthClientError(error, "Could not send magic link.");
      setStatus("sent");
    } catch (error) {
      setStatus("idle");
      setAuthError(
        getFriendlyAuthError(error, "Could not start passwordless sign in."),
      );
    }
  }

  async function handleResendOtp() {
    if (
      status === "verifying" ||
      isResendingCode ||
      resendSecondsRemaining > 0
    ) {
      return;
    }

    const parsedEmail = emailSchema.safeParse(email);
    if (!parsedEmail.success) {
      setOtpError(
        parsedEmail.error.issues[0]?.message ?? "Enter a valid email address.",
      );
      return;
    }

    setIsResendingCode(true);
    setOtpError("");
    setAuthError("");

    try {
      const normalizedEmail = parsedEmail.data.toLowerCase();
      await clearBackendSession();
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email: normalizedEmail,
        type: "sign-in",
      });

      throwAuthClientError(error, "Could not send a new code.");

      setEmail(normalizedEmail);
      setOtp("");
      resetOtpTimers();
    } catch (error) {
      setOtpError(getFriendlyAuthError(error, "Could not send a new code."));
    } finally {
      setIsResendingCode(false);
    }
  }

  async function handleVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isOtpExpired) {
      setOtpError("That code has expired. Request a new code to continue.");
      otpInputRef.current?.focus();
      return;
    }

    const parsedOtp = otpSchema.safeParse(otp);
    if (!parsedOtp.success) {
      setOtpError(
        parsedOtp.error.issues[0]?.message ?? "Enter the verification code.",
      );
      return;
    }

    setOtpError("");
    setAuthError("");
    setStatus("verifying");

    try {
      const normalizedEmail = email.toLowerCase();
      const { error } = await authClient.signIn.emailOtp({
        email: normalizedEmail,
        otp: parsedOtp.data,
        name: normalizedEmail.split("@")[0] || "Cocomama member",
      });

      throwAuthClientError(error, "Could not verify this code.");
      await completeSignIn(normalizedEmail);
    } catch (error) {
      setStatus("sent");
      setOtpError(getFriendlyAuthError(error, "Could not verify this code."));
      window.setTimeout(() => {
        otpInputRef.current?.focus();
        otpInputRef.current?.select();
      }, 0);
    }
  }

  return (
    <main className="min-h-dvh bg-background text-text">
      <div className="mx-auto grid min-h-dvh w-full max-w-6xl px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-12 lg:px-8">
        <section className="hidden min-h-0 flex-col justify-between py-8 lg:flex">
          <Link
            href="/"
            className="flex w-fit items-center gap-2 text-sm font-semibold text-text"
          >
            <span className="grid size-8 place-items-center rounded-md border border-border bg-surface text-sm font-bold">
              C
            </span>
            Cocobaa
          </Link>

          <motion.div
            className="max-w-xl"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <p className="text-sm font-medium text-text-soft">
              AI-first household finance
            </p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight text-text">
              Start with your email. Cocobaa keeps the money conversation
              private.
            </h1>
            <div className="mt-8 grid gap-3">
              {[
                "Passwordless access with OTP or magic link.",
                "Private chat history for every family member.",
                "Shared expenses stay visible to the household.",
              ].map((item, index) => (
                <motion.div
                  key={item}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-muted"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.08 + index * 0.05,
                    duration: 0.2,
                    ease: "easeOut",
                  }}
                >
                  <CheckCircle2
                    className="size-4 text-primary"
                    strokeWidth={1.9}
                    aria-hidden="true"
                  />
                  {item}
                </motion.div>
              ))}
            </div>
          </motion.div>

          <p className="text-sm text-text-soft">
            Email OTP and magic links are sent by the backend SMTP auth service.
          </p>
        </section>

        <section className="flex min-h-dvh items-center justify-center py-8 lg:min-h-0">
          <motion.div
            className="w-full max-w-md"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <Link
                href="/"
                className="flex items-center gap-2 text-sm font-semibold text-text"
              >
                <span className="grid size-8 place-items-center rounded-md border border-border bg-surface text-sm font-bold">
                  C
                </span>
                Cocobaa
              </Link>
              <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-muted">
                Passwordless
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-[0_16px_50px_rgba(15,23,42,0.07)] sm:p-6">
              <div className="mb-5">
                <div className="mb-4 grid size-10 place-items-center rounded-lg bg-text text-surface">
                  <ShieldCheck
                    className="size-5"
                    strokeWidth={1.9}
                    aria-hidden="true"
                  />
                </div>
                <h1 className="text-2xl font-semibold text-text">
                  Sign in or create your account
                </h1>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  Use your email to continue to Cocobaa. No password required.
                </p>
              </div>

              <AnimatePresence mode="wait">
                {isOtpStep ? (
                  <motion.div
                    key="otp-step"
                    className="grid gap-5"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                  >
                    <button
                      className="flex w-fit items-center gap-2 rounded-md px-1 py-1 text-sm font-medium text-text-muted transition hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                      type="button"
                      onClick={handleBackToSignIn}
                      disabled={isBusy}
                    >
                      <ArrowLeft
                        className="size-4"
                        strokeWidth={1.9}
                        aria-hidden="true"
                      />
                      Back to sign in
                    </button>

                    <form
                      ref={otpFormRef}
                      className="grid gap-4"
                      onSubmit={handleVerifyOtp}
                      noValidate
                    >
                      <div>
                        <p className="text-lg font-semibold text-text">
                          Enter the 6 digit code
                        </p>
                        <p className="mt-1 text-sm leading-6 text-text-muted">
                          We sent a one-time code to {email || "your email"}.
                          Enter it below to continue.
                        </p>
                      </div>

                      <label
                        className="grid gap-2 text-sm font-medium text-text"
                        htmlFor="otp"
                      >
                        Verification code
                        <input
                          ref={otpInputRef}
                          id="otp"
                          className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-center text-xl tracking-[0.35em] text-text outline-none transition placeholder:text-text-soft focus:border-primary"
                          value={otp}
                          onChange={(event) => {
                            const nextOtp = event.target.value
                              .replace(/\D/g, "")
                              .slice(0, 6);

                            if (nextOtp.length < 6) {
                              lastAutoSubmittedOtpRef.current = "";
                            }

                            setOtp(nextOtp);
                            setOtpError("");
                          }}
                          placeholder="000000"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          aria-invalid={Boolean(otpError)}
                          aria-describedby={
                            otpError
                              ? "otp-error otp-expiry-status"
                              : "otp-expiry-status"
                          }
                          disabled={status === "verifying"}
                        />
                      </label>

                      <AnimatePresence>
                        {otpError ? (
                          <ValidationAlert
                            key="otp-error"
                            id="otp-error"
                            title="OTP verification failed"
                            message={otpError}
                          />
                        ) : null}
                      </AnimatePresence>

                      <motion.button
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                        type="submit"
                        disabled={status === "verifying" || isOtpExpired}
                        whileHover={
                          status !== "verifying" && !isOtpExpired
                            ? { y: -1 }
                            : undefined
                        }
                        whileTap={
                          status !== "verifying" && !isOtpExpired
                            ? { scale: 0.98 }
                            : undefined
                        }
                      >
                        {status === "verifying" ? (
                          <LoaderCircle
                            className="size-4 animate-spin"
                            strokeWidth={1.9}
                            aria-hidden="true"
                          />
                        ) : (
                          <ArrowRight
                            className="size-4"
                            strokeWidth={1.9}
                            aria-hidden="true"
                          />
                        )}
                        {isOtpExpired ? "Code expired" : "Verify and continue"}
                      </motion.button>

                      <div
                        id="otp-expiry-status"
                        className="grid justify-items-center gap-2 text-center"
                        aria-live="polite"
                      >
                        <p
                          className={`text-sm leading-5 ${
                            isOtpExpired ? "text-danger" : "text-text-muted"
                          }`}
                        >
                          {isOtpExpired
                            ? "Code expired. Request a new code."
                            : `Code expires in ${formatCountdown(
                                otpSecondsRemaining,
                              )}.`}
                        </p>
                        <motion.button
                          className="inline-flex min-h-9 items-center justify-center rounded-md px-3 text-sm font-semibold text-primary transition hover:bg-surface-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-55"
                          type="button"
                          onClick={handleResendOtp}
                          disabled={
                            status === "verifying" ||
                            isResendingCode ||
                            resendSecondsRemaining > 0
                          }
                          whileHover={
                            status !== "verifying" &&
                            !isResendingCode &&
                            resendSecondsRemaining === 0
                              ? { y: -1 }
                              : undefined
                          }
                          whileTap={
                            status !== "verifying" &&
                            !isResendingCode &&
                            resendSecondsRemaining === 0
                              ? { scale: 0.98 }
                              : undefined
                          }
                        >
                          {isResendingCode
                            ? "Sending new code"
                            : resendSecondsRemaining > 0
                              ? `Resend in ${formatCountdown(
                                  resendSecondsRemaining,
                                )}`
                              : "Resend code"}
                        </motion.button>
                      </div>
                    </form>

                    {status === "verified" ? (
                      <motion.div
                        key="verified"
                        className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                      >
                        <div className="flex gap-3">
                          <CheckCircle2
                            className="mt-0.5 size-4 shrink-0"
                            strokeWidth={1.9}
                            aria-hidden="true"
                          />
                          <div>
                            <p className="font-semibold">Email verified</p>
                            <p className="mt-1 leading-6">
                              Signed in as {verifiedEmail || email}. The
                              protected session check passed.
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ) : null}
                  </motion.div>
                ) : (
                  <motion.div
                    key="signin-step"
                    initial={{ opacity: 0, x: -24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 24 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                  >
                    <form
                      className="grid gap-4"
                      onSubmit={handleRequestAuth}
                      noValidate
                    >
                      <label
                        className="grid gap-2 text-sm font-medium text-text"
                        htmlFor="email"
                      >
                        Email address
                        <input
                          id="email"
                          className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-base font-normal text-text outline-none transition placeholder:text-text-soft focus:border-primary"
                          value={email}
                          onChange={(event) => {
                            setEmail(event.target.value);
                            setEmailError("");
                          }}
                          placeholder="you@example.com"
                          inputMode="email"
                          autoComplete="email"
                          aria-invalid={Boolean(emailError)}
                          aria-describedby={
                            emailError ? "email-error" : undefined
                          }
                          disabled={isBusy}
                        />
                      </label>

                      <AnimatePresence mode="popLayout">
                        {emailError ? (
                          <ValidationAlert
                            key="email-error"
                            id="email-error"
                            title="Check your email address"
                            message={emailError}
                          />
                        ) : null}
                        {authError ? (
                          <ValidationAlert
                            key="auth-error"
                            title="Sign-in request failed"
                            message={authError}
                          />
                        ) : null}
                      </AnimatePresence>

                      <motion.button
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-text px-4 text-sm font-semibold text-surface transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        type="submit"
                        disabled={isBusy}
                        whileHover={!isBusy ? { y: -1 } : undefined}
                        whileTap={!isBusy ? { scale: 0.98 } : undefined}
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span
                            key={`${mode}-${status === "sending" ? "sending" : "idle"}`}
                            className="inline-flex items-center gap-2"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.14, ease: "easeOut" }}
                          >
                            {status === "sending" ? (
                              <LoaderCircle
                                className="size-4 animate-spin"
                                strokeWidth={1.9}
                                aria-hidden="true"
                              />
                            ) : mode === "otp" ? (
                              <KeyRound
                                className="size-4"
                                strokeWidth={1.9}
                                aria-hidden="true"
                              />
                            ) : (
                              <Mail
                                className="size-4"
                                strokeWidth={1.9}
                                aria-hidden="true"
                              />
                            )}
                            {status === "sending"
                              ? "Sending"
                              : mode === "otp"
                                ? "Send email code"
                                : "Send magic link"}
                          </motion.span>
                        </AnimatePresence>
                      </motion.button>

                      <motion.button
                        className="ml-auto inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-primary transition hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          handleModeChange(mode === "magic" ? "otp" : "magic")
                        }
                        whileHover={!isBusy ? { x: 2 } : undefined}
                        whileTap={!isBusy ? { scale: 0.98 } : undefined}
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span
                            key={mode}
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 4 }}
                            transition={{ duration: 0.14, ease: "easeOut" }}
                          >
                            {mode === "magic"
                              ? "Use email code instead"
                              : "Use magic link instead"}
                          </motion.span>
                        </AnimatePresence>
                        <ChevronRight
                          className="size-4"
                          strokeWidth={1.9}
                          aria-hidden="true"
                        />
                      </motion.button>
                    </form>

                    <AnimatePresence>
                      {status === "sent" && mode === "magic" ? (
                        <motion.div
                          key="magic"
                          className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                        >
                          <div className="flex gap-3">
                            <CheckCircle2
                              className="mt-0.5 size-4 shrink-0"
                              strokeWidth={1.9}
                              aria-hidden="true"
                            />
                            <div>
                              <p className="font-semibold">Magic link sent</p>
                              <p className="mt-1 leading-6">
                                Open the link sent to {email || "your email"}.
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </section>
      </div>
    </main>
  );
}
