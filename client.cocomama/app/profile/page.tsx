"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  BadgePlus,
  CheckCircle2,
  CircleAlert,
  CircleDollarSign,
  Globe2,
  LoaderCircle,
  Menu,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import worldCountries from "world-countries";
import { z } from "zod";
import { AppSideNavigation } from "../components/app-side-navigation";
import { ProfileAvatar } from "../components/profile-avatar";

type AppUser = {
  id: string;
  email: string;
  name: string;
  userProfile: string | null;
  country: string;
  currency: string;
  timezone: string;
  onboardingCompleted: boolean;
};

type AppMeResponse = {
  user?: AppUser;
  error?: string;
};

type CategoryKind = "expense" | "income" | "savings";

type CategoryItem = {
  id: string;
  kind: CategoryKind;
  name: string;
  emoji: string;
  keywords: string[];
  isDefault: boolean;
};

type CategoriesResponse = {
  categories?: CategoryItem[];
  error?: string;
  message?: string;
};

type CountryOption = {
  code: string;
  name: string;
  flag: string;
  currencies: string[];
};

type CurrencyOption = {
  code: string;
  label: string;
};

const diceBearFunEmojiOptions = [
  {
    label: "Beam",
    seed: "cocomama-beam",
    eyesVariant: "cute",
    mouthVariant: "wideSmile",
    backgroundColor: "f6d594",
  },
  {
    label: "Bloom",
    seed: "cocomama-bloom",
    eyesVariant: "love",
    mouthVariant: "smileTeeth",
    backgroundColor: "71cf62",
  },
  {
    label: "Breezy",
    seed: "cocomama-breezy",
    eyesVariant: "wink2",
    mouthVariant: "lilSmile",
    backgroundColor: "fcbc34",
  },
  {
    label: "Bright",
    seed: "cocomama-bright",
    eyesVariant: "stars",
    mouthVariant: "smileLol",
    backgroundColor: "059ff2",
  },
  {
    label: "Bubble",
    seed: "cocomama-bubble",
    eyesVariant: "glasses",
    mouthVariant: "tongueOut",
    backgroundColor: "d9915b",
  },
  {
    label: "Charm",
    seed: "cocomama-charm",
    eyesVariant: "wink",
    mouthVariant: "kissHeart",
    backgroundColor: "d84be5",
  },
  {
    label: "Cheer",
    seed: "cocomama-cheer",
    eyesVariant: "plain",
    mouthVariant: "wideSmile",
    backgroundColor: "71cf62",
  },
  {
    label: "Dream",
    seed: "cocomama-dream",
    eyesVariant: "sleepClose",
    mouthVariant: "shy",
    backgroundColor: "f6d594",
  },
  {
    label: "Glow",
    seed: "cocomama-glow",
    eyesVariant: "closed2",
    mouthVariant: "cute",
    backgroundColor: "fcbc34",
  },
  {
    label: "Jolly",
    seed: "cocomama-jolly",
    eyesVariant: "shades",
    mouthVariant: "smileTeeth",
    backgroundColor: "059ff2",
  },
  {
    label: "Peace",
    seed: "cocomama-peace",
    eyesVariant: "closed",
    mouthVariant: "lilSmile",
    backgroundColor: "71cf62",
  },
  {
    label: "Spark",
    seed: "cocomama-spark",
    eyesVariant: "tearDrop",
    mouthVariant: "smileLol",
    backgroundColor: "d84be5",
  },
];

const profileDetailsFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a username.")
    .max(80, "Use 80 characters or less."),
  country: z
    .string()
    .trim()
    .length(2, "Choose a country.")
    .regex(/^[a-zA-Z]{2}$/, "Choose a valid country."),
  currency: z
    .string()
    .trim()
    .length(3, "Choose a currency.")
    .regex(/^[a-zA-Z]{3}$/, "Choose a valid currency."),
});

const categoryFormSchema = z.object({
  kind: z.enum(["expense", "income", "savings"]),
  name: z
    .string()
    .trim()
    .min(1, "Enter a category name.")
    .max(80, "Use 80 characters or less."),
  keywords: z.string().trim().optional(),
});

const categoryKinds: Array<{ value: CategoryKind; label: string }> = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "savings", label: "Savings" },
];

const priorityCurrencyCodes = [
  "NPR",
  "USD",
  "INR",
  "EUR",
  "GBP",
  "AUD",
  "CAD",
  "SGD",
  "AED",
  "JPY",
];

function countryFlag(code: string) {
  return code
    .toUpperCase()
    .replace(/./g, (character) =>
      String.fromCodePoint(127397 + character.charCodeAt(0)),
    );
}

const countryOptions: CountryOption[] = worldCountries
  .filter((country) => Boolean(country.cca2) && Boolean(country.name?.common))
  .map((country) => {
    const code = country.cca2.toUpperCase();
    const currencies = Object.keys(country.currencies ?? {});

    return {
      code,
      name: country.name.common,
      flag: country.flag || countryFlag(code),
      currencies: currencies.length > 0 ? currencies : ["USD"],
    };
  })
  .sort((first, second) => first.name.localeCompare(second.name));

const countryOptionByCode = new Map(
  countryOptions.map((country) => [country.code, country] as const),
);

const supportedCurrencyCodes =
  (
    Intl as unknown as {
      supportedValuesOf?: (key: "currency") => string[];
    }
  ).supportedValuesOf?.("currency") ?? [];

const currencyOptions: CurrencyOption[] = Array.from(
  new Set([...priorityCurrencyCodes, ...supportedCurrencyCodes]),
)
  .filter((code) => /^[A-Z]{3}$/.test(code))
  .map((code) => ({
    code,
    label: getCurrencyLabel(code),
  }));

function getCurrencyLabel(code: string) {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "currency" }).of(code);

    return name ? `${code} - ${name}` : code;
  } catch {
    return code;
  }
}

function getFriendlyError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function buildDiceBearFunEmojiAvatarUrl({
  seed,
  eyesVariant,
  mouthVariant,
  backgroundColor,
}: (typeof diceBearFunEmojiOptions)[number]) {
  const params = new URLSearchParams({
    seed,
    eyesVariant,
    mouthVariant,
    backgroundColor,
    borderRadius: "16",
  });

  return `https://api.dicebear.com/10.x/fun-emoji/svg?${params.toString()}`;
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-md bg-surface-muted ${className}`}
    />
  );
}

function ProfilePageSkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading profile">
      <motion.section
        className="relative overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <div className="absolute inset-x-0 top-0 h-32 bg-[linear-gradient(135deg,rgba(36,92,87,0.16),rgba(22,138,84,0.08)_48%,rgba(36,99,166,0.12))]" />
        <div className="relative grid gap-5 p-4 pt-8 sm:p-6 sm:pt-10">
          <div className="grid justify-items-center gap-4 text-center">
            <SkeletonBlock className="size-28 rounded-full border-4 border-surface shadow-[0_10px_24px_rgba(23,23,23,0.055)] sm:size-32" />
            <div className="grid justify-items-center gap-2">
              <SkeletonBlock className="h-9 w-48 max-w-full rounded-lg sm:w-64" />
              <SkeletonBlock className="h-4 w-56 max-w-full" />
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                <SkeletonBlock className="h-8 w-32 rounded-full" />
                <SkeletonBlock className="h-8 w-20 rounded-full" />
                <SkeletonBlock className="size-8 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section
        className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04, duration: 0.2, ease: "easeOut" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <SkeletonBlock className="h-5 w-24" />
            <SkeletonBlock className="mt-2 h-4 w-72 max-w-full" />
          </div>
        </div>
        <div className="mt-4 grid gap-3 rounded-lg border border-border bg-background p-3">
          <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <div className="grid gap-2">
              <SkeletonBlock className="h-4 w-12" />
              <SkeletonBlock className="h-11 rounded-lg" />
            </div>
            <div className="grid gap-2">
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="h-11 rounded-lg" />
            </div>
          </div>
          <div className="grid gap-2">
            <SkeletonBlock className="h-4 w-20" />
            <SkeletonBlock className="h-11 rounded-lg" />
          </div>
          <SkeletonBlock className="h-11 w-36 rounded-lg" />
        </div>
        <div className="mt-4 grid gap-3">
          {["expense", "income", "savings"].map((item) => (
            <div
              key={item}
              className="rounded-lg border border-border bg-background p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <SkeletonBlock className="h-4 w-20" />
                <SkeletonBlock className="h-3 w-5" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {["w-24", "w-28", "w-20"].map((widthClass, index) => (
                  <SkeletonBlock
                    key={`${item}-${widthClass}-${index}`}
                    className={`h-7 rounded-full ${widthClass}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </motion.section>
    </div>
  );
}

export default function ProfilePage() {
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("NP");
  const [currency, setCurrency] = useState("NPR");
  const [userProfile, setUserProfile] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [categoryKind, setCategoryKind] = useState<CategoryKind>("expense");
  const [categoryName, setCategoryName] = useState("");
  const [categoryKeywords, setCategoryKeywords] = useState("");
  const [profileName, setProfileName] = useState("");
  const [localeCountry, setLocaleCountry] = useState("NP");
  const [localeCurrency, setLocaleCurrency] = useState("NPR");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [isLocalePickerOpen, setIsLocalePickerOpen] = useState(false);
  const [isSavingLocale, setIsSavingLocale] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [localeError, setLocaleError] = useState("");
  const [pageError, setPageError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [categoryMessage, setCategoryMessage] = useState("");

  const trimmedName = name.trim();
  const displayName = trimmedName || user?.name || "Profile";
  const displayCountry = country || user?.country || "NP";
  const displayCurrency = currency || user?.currency || "NPR";
  const displayCountryOption = countryOptionByCode.get(
    displayCountry.toUpperCase(),
  );
  const displayCountryName = displayCountryOption?.name ?? displayCountry;
  const displayCountryFlag =
    displayCountryOption?.flag ?? countryFlag(displayCountry);
  const groupedCategories = categories.reduce<
    Record<CategoryKind, CategoryItem[]>
  >(
    (currentGroups, category) => ({
      ...currentGroups,
      [category.kind]: [...currentGroups[category.kind], category],
    }),
    { expense: [], income: [], savings: [] },
  );

  useEffect(() => {
    let isActive = true;

    async function loadProfile() {
      setIsLoading(true);
      setPageError("");

      try {
        const response = await fetch("/api/app/me", {
          cache: "no-store",
          credentials: "include",
        });
        const body = (await response
          .json()
          .catch(() => null)) as AppMeResponse | null;

        if (!response.ok || !body?.user) {
          throw new Error("Profile could not load.");
        }

        if (isActive) {
          setUser(body.user);
          setName(body.user.name);
          setProfileName(body.user.name);
          setCountry(body.user.country);
          setCurrency(body.user.currency);
          setLocaleCountry(body.user.country);
          setLocaleCurrency(body.user.currency);
          setUserProfile(body.user.userProfile ?? null);
        }

        const categoriesResponse = await fetch("/api/app/categories", {
          cache: "no-store",
          credentials: "include",
        });
        const categoriesBody = (await categoriesResponse
          .json()
          .catch(() => null)) as CategoriesResponse | null;

        if (!categoriesResponse.ok || !categoriesBody?.categories) {
          throw new Error("Categories could not load.");
        }

        if (isActive) {
          setCategories(categoriesBody.categories);
        }
      } catch (error) {
        if (isActive) {
          setPageError(getFriendlyError(error, "Profile could not load."));
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isActive = false;
    };
  }, []);

  async function handleCategorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = categoryFormSchema.safeParse({
      kind: categoryKind,
      name: categoryName,
      keywords: categoryKeywords,
    });

    if (!parsed.success) {
      setCategoryError(
        parsed.error.issues[0]?.message ?? "Check the category details.",
      );
      return;
    }

    const keywords =
      parsed.data.keywords
        ?.split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean) ?? [];

    setIsSavingCategory(true);
    setCategoryError("");
    setCategoryMessage("");

    try {
      const response = await fetch("/api/app/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind: parsed.data.kind,
          name: parsed.data.name,
          keywords,
        }),
      });
      const body = (await response
        .json()
        .catch(() => null)) as CategoriesResponse & {
        category?: CategoryItem | null;
      };

      if (!response.ok || !body?.category) {
        throw new Error(body?.message ?? "Category could not be saved.");
      }

      setCategories((currentCategories) =>
        [...currentCategories, body.category].sort((left, right) =>
          `${left.kind}:${left.name}`.localeCompare(
            `${right.kind}:${right.name}`,
          ),
        ),
      );
      setCategoryName("");
      setCategoryKeywords("");
      setCategoryMessage("Category added");
    } catch (error) {
      setCategoryError(getFriendlyError(error, "Category could not be saved."));
    } finally {
      setIsSavingCategory(false);
    }
  }

  function openLocalePicker() {
    setProfileName(displayName);
    setLocaleCountry(displayCountry.toUpperCase());
    setLocaleCurrency(displayCurrency.toUpperCase());
    setLocaleError("");
    setSaveMessage("");
    setIsLocalePickerOpen(true);
  }

  function handleLocaleCountryChange(nextCountry: string) {
    setLocaleCountry(nextCountry);
    setLocaleError("");
    setSaveMessage("");

    const nextCountryOption = countryOptionByCode.get(nextCountry);

    if (
      nextCountryOption?.currencies.length &&
      !nextCountryOption.currencies.includes(localeCurrency)
    ) {
      setLocaleCurrency(nextCountryOption.currencies[0] ?? localeCurrency);
    }
  }

  async function handleLocaleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = profileDetailsFormSchema.safeParse({
      name: profileName,
      country: localeCountry,
      currency: localeCurrency,
    });

    if (!parsed.success) {
      setLocaleError(
        parsed.error.issues[0]?.message ?? "Check the profile details.",
      );
      return;
    }

    setIsSavingLocale(true);
    setLocaleError("");
    setPageError("");

    try {
      const response = await fetch("/api/app/me", {
        method: "PATCH",
        cache: "no-store",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: parsed.data.name,
          country: parsed.data.country.toUpperCase(),
          currency: parsed.data.currency.toUpperCase(),
        }),
      });
      const body = (await response
        .json()
        .catch(() => null)) as AppMeResponse | null;

      if (!response.ok || !body?.user) {
        throw new Error("Country and currency could not be saved.");
      }

      setUser(body.user);
      setCountry(body.user.country);
      setCurrency(body.user.currency);
      setName(body.user.name);
      setProfileName(body.user.name);
      setLocaleCountry(body.user.country);
      setLocaleCurrency(body.user.currency);
      setSaveMessage("Profile details updated");
      setIsLocalePickerOpen(false);
    } catch (error) {
      setLocaleError(
        getFriendlyError(error, "Profile details could not be saved."),
      );
    } finally {
      setIsSavingLocale(false);
    }
  }

  async function handleAvatarSelect(nextUserProfile: string) {
    setUserProfile(nextUserProfile);
    setIsSavingAvatar(true);
    setPageError("");
    setSaveMessage("");

    try {
      const response = await fetch("/api/app/me", {
        method: "PATCH",
        cache: "no-store",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userProfile: nextUserProfile,
        }),
      });
      const body = (await response
        .json()
        .catch(() => null)) as AppMeResponse | null;

      if (!response.ok || !body?.user) {
        throw new Error("Profile image could not be saved.");
      }

      setUser(body.user);
      setUserProfile(body.user.userProfile ?? null);
      setSaveMessage("Profile image updated");
      setIsAvatarPickerOpen(false);
    } catch (error) {
      setUserProfile(user?.userProfile ?? null);
      setPageError(
        getFriendlyError(error, "Profile image could not be saved."),
      );
    } finally {
      setIsSavingAvatar(false);
    }
  }

  return (
    <main className="h-dvh overflow-hidden bg-background text-text">
      <div className="flex h-full min-h-0 w-full">
        <AppSideNavigation
          activeItem="Profile"
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
                <p className="text-sm font-semibold text-text">Profile</p>
                <p className="truncate text-xs text-text-soft">
                  {user?.email ?? "Account settings"}
                </p>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto bg-background py-4 sm:bg-[radial-gradient(circle_at_92%_10%,rgba(36,92,87,0.08),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.34),rgba(251,250,247,0))]">
            <div className="mx-auto grid w-full max-w-4xl gap-3 px-3 pb-28 sm:px-6 lg:px-8 lg:pb-8">
              {isLoading ? (
                <ProfilePageSkeleton />
              ) : (
                <>
                  <motion.section
                    className="relative overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.24, ease: "easeOut" }}
                  >
                    <div className="absolute inset-x-0 top-0 h-32 bg-[linear-gradient(135deg,rgba(36,92,87,0.16),rgba(22,138,84,0.08)_48%,rgba(36,99,166,0.12))]" />
                    <div className="relative grid gap-5 p-4 pt-8 sm:p-6 sm:pt-10">
                      <div className="grid justify-items-center gap-4 text-center">
                        <div className="relative">
                          <ProfileAvatar
                            label={displayName}
                            userProfile={userProfile}
                            className="size-28 border-4 border-surface shadow-[0_12px_26px_rgba(23,23,23,0.075)] sm:size-32"
                            initialClassName="text-4xl"
                          />
                          <button
                            className="absolute -right-2 bottom-2 z-10 grid size-10 place-items-center rounded-full border-2 border-surface bg-text text-surface shadow-[0_7px_18px_rgba(23,23,23,0.12)] transition hover:bg-primary"
                            type="button"
                            aria-label="Edit profile image"
                            onClick={() => setIsAvatarPickerOpen(true)}
                          >
                            <Pencil
                              className="size-4"
                              strokeWidth={1.9}
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                        <div className="min-w-0">
                          <h1 className="mt-1 max-w-full truncate text-3xl font-semibold leading-tight text-text sm:text-4xl">
                            {displayName}
                          </h1>
                          <p className="mt-1 max-w-full truncate text-sm font-medium text-text-muted">
                            {user?.email ?? "-"}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                            <span
                              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background/75 px-3 py-1.5 text-xs font-semibold text-text-muted shadow-sm"
                              title={displayCountryName}
                            >
                              <span aria-hidden="true" className="text-sm">
                                {displayCountryFlag}
                              </span>
                              <span className="max-w-44 truncate">
                                {displayCountryName}
                              </span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/75 px-3 py-1.5 text-xs font-semibold text-text-muted shadow-sm">
                              <CircleDollarSign
                                className="size-3.5 text-primary"
                                strokeWidth={1.9}
                                aria-hidden="true"
                              />
                              {displayCurrency}
                            </span>
                            <motion.button
                              className="grid size-8 place-items-center rounded-full border-2 border-surface bg-text text-surface shadow-[0_6px_16px_rgba(23,23,23,0.1)] transition hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
                              type="button"
                              aria-label="Edit profile details"
                              onClick={openLocalePicker}
                              disabled={isSavingLocale}
                              whileHover={{ y: isSavingLocale ? 0 : -1 }}
                              whileTap={{ scale: isSavingLocale ? 1 : 0.95 }}
                            >
                              <Pencil
                                className="size-3.5"
                                strokeWidth={1.9}
                                aria-hidden="true"
                              />
                            </motion.button>
                          </div>
                        </div>
                      </div>
                      <AnimatePresence>
                        {saveMessage ? (
                          <motion.span
                            className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-success"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.16, ease: "easeOut" }}
                          >
                            <CheckCircle2
                              className="size-3.5"
                              strokeWidth={1.9}
                              aria-hidden="true"
                            />
                            {saveMessage}
                          </motion.span>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  </motion.section>

                  <AnimatePresence>
                    {pageError ? (
                      <motion.div
                        className="flex gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-danger"
                        role="alert"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                      >
                        <CircleAlert
                          className="mt-0.5 size-4 shrink-0"
                          strokeWidth={1.9}
                          aria-hidden="true"
                        />
                        {pageError}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  <motion.section
                    className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.08,
                      duration: 0.24,
                      ease: "easeOut",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-text">
                          Categories
                        </h2>
                        <p className="mt-0.5 text-sm text-text-soft">
                          Add categories AI can choose from when saving records
                        </p>
                      </div>
                      {categoryMessage ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-success">
                          <CheckCircle2
                            className="size-3.5"
                            strokeWidth={1.9}
                            aria-hidden="true"
                          />
                          {categoryMessage}
                        </span>
                      ) : null}
                    </div>

                    <form
                      className="mt-4 grid gap-3 rounded-lg border border-border bg-background p-3"
                      onSubmit={handleCategorySubmit}
                    >
                      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                        <label className="grid gap-2 text-sm font-semibold text-text">
                          Type
                          <select
                            className="min-h-11 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                            value={categoryKind}
                            onChange={(event) => {
                              setCategoryKind(
                                event.target.value as CategoryKind,
                              );
                              setCategoryError("");
                              setCategoryMessage("");
                            }}
                            disabled={isSavingCategory}
                          >
                            {categoryKinds.map((kind) => (
                              <option key={kind.value} value={kind.value}>
                                {kind.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-2 text-sm font-semibold text-text">
                          Category name
                          <input
                            className="min-h-11 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text outline-none transition placeholder:text-text-soft focus:border-primary focus:ring-2 focus:ring-primary/15"
                            value={categoryName}
                            onChange={(event) => {
                              setCategoryName(event.target.value);
                              setCategoryError("");
                              setCategoryMessage("");
                            }}
                            placeholder="Dining out"
                            disabled={isSavingCategory}
                          />
                        </label>
                      </div>
                      <label className="grid gap-2 text-sm font-semibold text-text">
                        Keywords
                        <input
                          className="min-h-11 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-text outline-none transition placeholder:text-text-soft focus:border-primary focus:ring-2 focus:ring-primary/15"
                          value={categoryKeywords}
                          onChange={(event) => {
                            setCategoryKeywords(event.target.value);
                            setCategoryError("");
                            setCategoryMessage("");
                          }}
                          placeholder="restaurants, cafe, takeout"
                          disabled={isSavingCategory}
                        />
                      </label>
                      <AnimatePresence>
                        {categoryError ? (
                          <motion.p
                            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger"
                            role="alert"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.16, ease: "easeOut" }}
                          >
                            {categoryError}
                          </motion.p>
                        ) : null}
                      </AnimatePresence>
                      <motion.button
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 sm:justify-self-start"
                        type="submit"
                        disabled={isSavingCategory}
                        whileHover={{ y: isSavingCategory ? 0 : -1 }}
                        whileTap={{ scale: isSavingCategory ? 1 : 0.98 }}
                      >
                        {isSavingCategory ? (
                          <LoaderCircle
                            className="size-4 animate-spin"
                            strokeWidth={1.9}
                            aria-hidden="true"
                          />
                        ) : (
                          <BadgePlus
                            className="size-4"
                            strokeWidth={1.9}
                            aria-hidden="true"
                          />
                        )}
                        Add category
                      </motion.button>
                    </form>

                    <div className="mt-4 grid gap-3">
                      {categoryKinds.map((kind) => {
                        const kindCategories = groupedCategories[kind.value];

                        return (
                          <section
                            key={kind.value}
                            className="rounded-lg border border-border bg-background p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <h3 className="text-sm font-semibold text-text">
                                {kind.label}
                              </h3>
                              <span className="text-xs font-semibold text-text-soft">
                                {kindCategories.length}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {kindCategories.length > 0 ? (
                                kindCategories.map((category) => (
                                  <span
                                    key={category.id}
                                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-text-muted"
                                    title={
                                      category.keywords.length
                                        ? category.keywords.join(", ")
                                        : undefined
                                    }
                                  >
                                    <span
                                      aria-hidden="true"
                                      className="shrink-0 text-sm"
                                    >
                                      {category.emoji}
                                    </span>
                                    <span className="truncate">
                                      {category.name}
                                    </span>
                                    {category.isDefault ? (
                                      <span className="text-text-soft">
                                        default
                                      </span>
                                    ) : null}
                                  </span>
                                ))
                              ) : (
                                <p className="text-sm text-text-soft">
                                  No {kind.label.toLowerCase()} categories yet.
                                </p>
                              )}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  </motion.section>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
      <AnimatePresence>
        {isAvatarPickerOpen ? (
          <motion.div
            className="fixed inset-0 z-50 grid place-items-end bg-slate-950/30 p-0 sm:place-items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="avatar-picker-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <button
              className="absolute inset-0"
              type="button"
              aria-label="Close profile image picker"
              onClick={() => setIsAvatarPickerOpen(false)}
            />
            <motion.div
              className="relative w-full rounded-t-xl border border-border bg-surface p-4 shadow-xl sm:max-w-lg sm:rounded-xl sm:p-5"
              initial={{ y: 22, opacity: 0.96 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 18, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <div className="flex items-center justify-between gap-3">
                <h2
                  id="avatar-picker-title"
                  className="text-base font-semibold text-text"
                >
                  Choose profile image
                </h2>
                <motion.button
                  className="grid size-10 place-items-center rounded-full text-text-muted transition hover:bg-surface-muted hover:text-text"
                  type="button"
                  aria-label="Close profile image picker"
                  onClick={() => setIsAvatarPickerOpen(false)}
                  disabled={isSavingAvatar}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {isSavingAvatar ? (
                    <LoaderCircle
                      className="size-4 animate-spin"
                      strokeWidth={1.9}
                      aria-hidden="true"
                    />
                  ) : (
                    <X
                      className="size-4"
                      strokeWidth={1.9}
                      aria-hidden="true"
                    />
                  )}
                </motion.button>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {diceBearFunEmojiOptions.map((option) => {
                  const avatarUrl = buildDiceBearFunEmojiAvatarUrl(option);
                  const isSelected = userProfile === avatarUrl;

                  return (
                    <motion.button
                      key={option.seed}
                      className={`grid gap-2 rounded-lg border bg-background p-2 text-center transition hover:border-primary ${
                        isSelected
                          ? "border-primary ring-2 ring-primary/15"
                          : "border-border"
                      }`}
                      type="button"
                      aria-label={`Use ${option.label} avatar`}
                      aria-pressed={isSelected}
                      onClick={() => void handleAvatarSelect(avatarUrl)}
                      disabled={isSavingAvatar}
                      whileHover={{ y: isSavingAvatar ? 0 : -1 }}
                      whileTap={{ scale: isSavingAvatar ? 1 : 0.96 }}
                    >
                      <span
                        className="mx-auto block size-14 rounded-lg bg-cover bg-center bg-no-repeat sm:size-16"
                        style={{ backgroundImage: `url(${avatarUrl})` }}
                        aria-hidden="true"
                      />
                      <span className="truncate text-xs font-semibold text-text-muted">
                        {option.label}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
        {isLocalePickerOpen ? (
          <motion.div
            className="fixed inset-0 z-50 grid place-items-start bg-black/20 p-0 sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="locale-picker-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <button
              className="absolute inset-0"
              type="button"
              aria-label="Close profile details editor"
              onClick={() => setIsLocalePickerOpen(false)}
              disabled={isSavingLocale}
            />
            <motion.form
              className="relative box-border max-h-[92dvh] w-full max-w-full overflow-x-hidden overflow-y-auto rounded-b-4xl border border-white/70 bg-[#f5f5f7]/95 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:mx-auto sm:max-w-lg sm:rounded-4xl sm:p-5"
              onSubmit={handleLocaleSubmit}
              initial={{ y: -28, opacity: 0.96 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -24, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2
                    id="locale-picker-title"
                    className="text-xl font-semibold leading-tight text-text"
                  >
                    Profile details
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-text-soft">
                    Username, country, and currency.
                  </p>
                </div>
                <motion.button
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-black/5 text-text-muted transition hover:bg-black/10 hover:text-text"
                  type="button"
                  aria-label="Close profile details editor"
                  onClick={() => setIsLocalePickerOpen(false)}
                  disabled={isSavingLocale}
                  whileHover={{ y: isSavingLocale ? 0 : -1 }}
                  whileTap={{ scale: isSavingLocale ? 1 : 0.95 }}
                >
                  <X className="size-4" strokeWidth={1.9} aria-hidden="true" />
                </motion.button>
              </div>

              <div className="mt-5 grid min-w-0 gap-3">
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-text">
                  Username
                  <input
                    className="min-h-12 w-full min-w-0 rounded-2xl border-0 bg-white px-4 text-base font-medium text-text outline-none ring-1 ring-black/5 transition placeholder:text-text-soft focus:ring-2 focus:ring-[#007aff]/25"
                    value={profileName}
                    onChange={(event) => {
                      setProfileName(event.target.value);
                      setLocaleError("");
                      setSaveMessage("");
                    }}
                    disabled={isSavingLocale}
                    autoComplete="name"
                  />
                </label>

                <label className="grid min-w-0 gap-2 text-sm font-semibold text-text">
                  <span className="inline-flex items-center gap-2">
                    <Globe2
                      className="size-4 text-[#007aff]"
                      strokeWidth={1.9}
                      aria-hidden="true"
                    />
                    Country
                  </span>
                  <select
                    className="min-h-12 w-full min-w-0 rounded-2xl border-0 bg-white px-4 text-base font-medium text-text outline-none ring-1 ring-black/5 transition focus:ring-2 focus:ring-[#007aff]/25"
                    value={localeCountry}
                    onChange={(event) =>
                      handleLocaleCountryChange(event.target.value)
                    }
                    disabled={isSavingLocale}
                  >
                    {countryOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.flag} {option.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid min-w-0 gap-2 text-sm font-semibold text-text">
                  <span className="inline-flex items-center gap-2">
                    <CircleDollarSign
                      className="size-4 text-[#007aff]"
                      strokeWidth={1.9}
                      aria-hidden="true"
                    />
                    Currency
                  </span>
                  <select
                    className="min-h-12 w-full min-w-0 rounded-2xl border-0 bg-white px-4 text-base font-medium text-text outline-none ring-1 ring-black/5 transition focus:ring-2 focus:ring-[#007aff]/25"
                    value={localeCurrency}
                    onChange={(event) => {
                      setLocaleCurrency(event.target.value);
                      setLocaleError("");
                      setSaveMessage("");
                    }}
                    disabled={isSavingLocale}
                  >
                    {currencyOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <AnimatePresence>
                  {localeError ? (
                    <motion.p
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger"
                      role="alert"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16, ease: "easeOut" }}
                    >
                      {localeError}
                    </motion.p>
                  ) : null}
                </AnimatePresence>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-black/5 px-4 text-sm font-semibold text-text-muted transition hover:bg-black/10 hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={() => setIsLocalePickerOpen(false)}
                    disabled={isSavingLocale}
                  >
                    Cancel
                  </button>
                  <motion.button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#007aff] px-4 text-sm font-semibold text-white transition hover:bg-[#006ee6] disabled:cursor-not-allowed disabled:opacity-60"
                    type="submit"
                    disabled={isSavingLocale}
                    whileHover={{ y: isSavingLocale ? 0 : -1 }}
                    whileTap={{ scale: isSavingLocale ? 1 : 0.98 }}
                  >
                    {isSavingLocale ? (
                      <LoaderCircle
                        className="size-4 animate-spin"
                        strokeWidth={1.9}
                        aria-hidden="true"
                      />
                    ) : (
                      <Save
                        className="size-4"
                        strokeWidth={1.9}
                        aria-hidden="true"
                      />
                    )}
                    Save
                  </motion.button>
                </div>
              </div>
            </motion.form>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
