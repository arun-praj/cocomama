"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AtSign,
  BadgePlus,
  CheckCircle2,
  CircleAlert,
  CircleDollarSign,
  Globe2,
  LoaderCircle,
  Menu,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
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
  keywords: string[];
  isDefault: boolean;
};

type CategoriesResponse = {
  categories?: CategoryItem[];
  error?: string;
  message?: string;
};

type CurrencyOption = {
  code: string;
  label: string;
};

const maxUploadBytes = 2 * 1024 * 1024;
const maxProfileDataUrlLength = 600_000;
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const profileFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a username.")
    .max(80, "Use 80 characters or less."),
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

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Photo could not be read."));
    });
    reader.addEventListener("error", () => {
      reject(new Error("Photo could not be read."));
    });
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => {
      reject(new Error("Choose a different photo."));
    });
    image.src = dataUrl;
  });
}

async function buildProfileDataUrl(file: File) {
  if (!acceptedImageTypes.has(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP photo.");
  }

  if (file.size > maxUploadBytes) {
    throw new Error("Choose a photo under 2 MB.");
  }

  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(sourceDataUrl);
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
  const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);
  const canvas = document.createElement("canvas");
  const canvasSize = 360;

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Photo could not be prepared.");
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    canvasSize,
    canvasSize,
  );

  const profileDataUrl = canvas.toDataURL("image/webp", 0.86);

  if (profileDataUrl.length > maxProfileDataUrlLength) {
    throw new Error("Choose a smaller photo.");
  }

  return profileDataUrl;
}

function ProfileField({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-background px-3 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-muted text-text-soft">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase text-text-soft">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-text">
          {value}
        </span>
      </span>
    </div>
  );
}

export default function ProfilePage() {
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("NPR");
  const [userProfile, setUserProfile] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [categoryKind, setCategoryKind] = useState<CategoryKind>("expense");
  const [categoryName, setCategoryName] = useState("");
  const [categoryKeywords, setCategoryKeywords] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false);
  const [nameError, setNameError] = useState("");
  const [currencyError, setCurrencyError] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [pageError, setPageError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [categoryMessage, setCategoryMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const trimmedName = name.trim();
  const hasChanges = Boolean(
    user &&
    (trimmedName !== user.name ||
      currency !== user.currency ||
      userProfile !== user.userProfile),
  );
  const displayName = trimmedName || user?.name || "Profile";
  const displayCurrency = currency || user?.currency || "NPR";
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
          setCurrency(body.user.currency);
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

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    setIsPreparingPhoto(true);
    setPhotoError("");
    setPageError("");
    setSaveMessage("");

    try {
      setUserProfile(await buildProfileDataUrl(file));
    } catch (error) {
      setPhotoError(getFriendlyError(error, "Photo could not be prepared."));
    } finally {
      setIsPreparingPhoto(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = profileFormSchema.safeParse({ name, currency });

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;

      setNameError(fieldErrors.name?.[0] ?? "");
      setCurrencyError(fieldErrors.currency?.[0] ?? "");
      return;
    }

    setIsSaving(true);
    setNameError("");
    setCurrencyError("");
    setPhotoError("");
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
          name: parsed.data.name,
          currency: parsed.data.currency.toUpperCase(),
          userProfile,
        }),
      });
      const body = (await response
        .json()
        .catch(() => null)) as AppMeResponse | null;

      if (!response.ok || !body?.user) {
        throw new Error("Profile could not be saved.");
      }

      setUser(body.user);
      setName(body.user.name);
      setCurrency(body.user.currency);
      setUserProfile(body.user.userProfile ?? null);
      setSaveMessage("Profile updated");
    } catch (error) {
      setPageError(getFriendlyError(error, "Profile could not be saved."));
    } finally {
      setIsSaving(false);
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
                className="grid size-10 place-items-center rounded-md border border-border bg-surface text-text-muted transition hover:text-text"
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
            <div className="mx-auto grid w-full max-w-4xl gap-3 px-3 pb-8 sm:px-6 lg:px-8">
              {isLoading ? (
                <div
                  className="grid place-items-center rounded-xl border border-border bg-surface py-16 text-sm text-text-muted shadow-sm"
                  aria-busy="true"
                >
                  <LoaderCircle
                    className="mb-3 size-5 animate-spin"
                    strokeWidth={1.9}
                    aria-hidden="true"
                  />
                  Loading profile
                </div>
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
                        <ProfileAvatar
                          label={displayName}
                          userProfile={userProfile}
                          className="size-28 border-4 border-surface shadow-[0_18px_36px_rgba(23,23,23,0.12)] sm:size-32"
                          initialClassName="text-4xl"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase text-text-soft">
                            {displayCurrency}
                          </p>
                          <h1 className="mt-1 max-w-full truncate text-3xl font-semibold leading-tight text-text sm:text-4xl">
                            {displayName}
                          </h1>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <ProfileField
                          icon={
                            <AtSign
                              className="size-4"
                              strokeWidth={1.9}
                              aria-hidden="true"
                            />
                          }
                          label="Email"
                          value={user?.email ?? "-"}
                        />
                        <ProfileField
                          icon={
                            <Globe2
                              className="size-4"
                              strokeWidth={1.9}
                              aria-hidden="true"
                            />
                          }
                          label="Country"
                          value={user?.country ?? "-"}
                        />
                        <ProfileField
                          icon={
                            <CircleDollarSign
                              className="size-4"
                              strokeWidth={1.9}
                              aria-hidden="true"
                            />
                          }
                          label="Currency"
                          value={displayCurrency}
                        />
                      </div>
                    </div>
                  </motion.section>

                  <motion.form
                    className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5"
                    onSubmit={handleSubmit}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.04,
                      duration: 0.24,
                      ease: "easeOut",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-text">
                          Account
                        </h2>
                        <p className="mt-0.5 text-sm text-text-soft">
                          Username, photo, and currency
                        </p>
                      </div>
                      {saveMessage ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-success">
                          <CheckCircle2
                            className="size-3.5"
                            strokeWidth={1.9}
                            aria-hidden="true"
                          />
                          {saveMessage}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-5 grid gap-5">
                      <section className="rounded-lg border border-border bg-background p-3">
                        <div className="flex flex-col items-center gap-3 text-center">
                          <ProfileAvatar
                            label={displayName}
                            userProfile={userProfile}
                            className="size-24 border-4 border-surface shadow-sm"
                            initialClassName="text-3xl"
                          />
                          <div>
                            <h3 className="text-sm font-semibold text-text">
                              Profile photo
                            </h3>
                            <p className="mt-0.5 text-xs text-text-soft">
                              JPG, PNG, or WebP under 2 MB
                            </p>
                          </div>
                          <input
                            ref={fileInputRef}
                            className="sr-only"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handlePhotoChange}
                            disabled={isSaving || isPreparingPhoto}
                          />
                          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-[auto_auto]">
                            <motion.button
                              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-text transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isSaving || isPreparingPhoto}
                              whileHover={{
                                y: isSaving || isPreparingPhoto ? 0 : -1,
                              }}
                              whileTap={{
                                scale: isSaving || isPreparingPhoto ? 1 : 0.98,
                              }}
                            >
                              {isPreparingPhoto ? (
                                <LoaderCircle
                                  className="size-4 animate-spin"
                                  strokeWidth={1.9}
                                  aria-hidden="true"
                                />
                              ) : (
                                <Upload
                                  className="size-4"
                                  strokeWidth={1.9}
                                  aria-hidden="true"
                                />
                              )}
                              Upload
                            </motion.button>
                            <motion.button
                              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-text-muted transition hover:border-red-200 hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
                              type="button"
                              onClick={() => {
                                setUserProfile(null);
                                setPhotoError("");
                                setSaveMessage("");
                              }}
                              disabled={
                                isSaving || isPreparingPhoto || !userProfile
                              }
                              whileHover={{
                                y:
                                  isSaving || isPreparingPhoto || !userProfile
                                    ? 0
                                    : -1,
                              }}
                              whileTap={{
                                scale:
                                  isSaving || isPreparingPhoto || !userProfile
                                    ? 1
                                    : 0.98,
                              }}
                            >
                              <Trash2
                                className="size-4"
                                strokeWidth={1.9}
                                aria-hidden="true"
                              />
                              Remove
                            </motion.button>
                          </div>
                        </div>
                        <AnimatePresence>
                          {photoError ? (
                            <motion.p
                              className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger"
                              role="alert"
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.16, ease: "easeOut" }}
                            >
                              {photoError}
                            </motion.p>
                          ) : null}
                        </AnimatePresence>
                      </section>

                      <label className="grid gap-2 text-sm font-semibold text-text">
                        Username
                        <input
                          className={`min-h-12 rounded-lg border bg-background px-3 text-base font-medium outline-none transition placeholder:text-text-soft focus:ring-2 focus:ring-primary/15 ${
                            nameError
                              ? "border-red-300 focus:border-danger"
                              : "border-border focus:border-primary"
                          }`}
                          value={name}
                          onChange={(event) => {
                            setName(event.target.value);
                            setNameError("");
                            setSaveMessage("");
                          }}
                          disabled={isSaving}
                          autoComplete="name"
                          aria-invalid={Boolean(nameError)}
                          aria-describedby={
                            nameError ? "profile-name-error" : undefined
                          }
                        />
                      </label>
                      <AnimatePresence>
                        {nameError ? (
                          <motion.p
                            id="profile-name-error"
                            className="-mt-3 text-sm font-medium text-danger"
                            role="alert"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.16, ease: "easeOut" }}
                          >
                            {nameError}
                          </motion.p>
                        ) : null}
                      </AnimatePresence>

                      <label className="grid gap-2 text-sm font-semibold text-text">
                        Currency
                        <select
                          className={`min-h-12 rounded-lg border bg-background px-3 text-base font-medium outline-none transition focus:ring-2 focus:ring-primary/15 ${
                            currencyError
                              ? "border-red-300 focus:border-danger"
                              : "border-border focus:border-primary"
                          }`}
                          value={currency}
                          onChange={(event) => {
                            setCurrency(event.target.value);
                            setCurrencyError("");
                            setSaveMessage("");
                          }}
                          disabled={isSaving}
                          aria-invalid={Boolean(currencyError)}
                          aria-describedby={
                            currencyError ? "profile-currency-error" : undefined
                          }
                        >
                          {currencyOptions.map((option) => (
                            <option key={option.code} value={option.code}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <AnimatePresence>
                        {currencyError ? (
                          <motion.p
                            id="profile-currency-error"
                            className="-mt-3 text-sm font-medium text-danger"
                            role="alert"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.16, ease: "easeOut" }}
                          >
                            {currencyError}
                          </motion.p>
                        ) : null}
                      </AnimatePresence>

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

                      <motion.button
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 sm:justify-self-start"
                        type="submit"
                        disabled={isSaving || isPreparingPhoto || !hasChanges}
                        whileHover={{
                          y:
                            isSaving || isPreparingPhoto || !hasChanges
                              ? 0
                              : -1,
                        }}
                        whileTap={{
                          scale:
                            isSaving || isPreparingPhoto || !hasChanges
                              ? 1
                              : 0.98,
                        }}
                      >
                        {isSaving ? (
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
                        Save profile
                      </motion.button>
                    </div>
                  </motion.form>

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
    </main>
  );
}
