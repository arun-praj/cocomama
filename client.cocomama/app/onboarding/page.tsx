"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
  Search,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import worldCountries from "world-countries";
import { z } from "zod";

type CountryOption = {
  code: string;
  name: string;
  flag: string;
  currencies: string[];
  searchText: string;
};

type CurrencyOption = {
  code: string;
  name: string;
  symbol: string;
  searchText: string;
};

type SearchableOption = {
  value: string;
  label: string;
  meta?: string;
  leading?: string;
  searchText: string;
};

const onboardingSchema = z.object({
  displayName: z.string().trim().min(1, "Tell us what to call you."),
  country: z.string().length(2),
  currency: z.string().length(3),
});

function countryFlag(code: string) {
  return code
    .toUpperCase()
    .replace(/./g, (character) =>
      String.fromCodePoint(127397 + character.charCodeAt(0)),
    );
}

function currencyName(code: string, fallback?: string) {
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "currency" }).of(code) ??
      fallback ??
      code
    );
  } catch {
    return fallback ?? code;
  }
}

function currencySymbol(code: string, fallback?: string) {
  try {
    const part = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    })
      .formatToParts(0)
      .find((item) => item.type === "currency");

    return part?.value ?? fallback ?? code;
  } catch {
    return fallback ?? code;
  }
}

const countryOptions: CountryOption[] = worldCountries
  .filter((country) => Boolean(country.cca2) && Boolean(country.name?.common))
  .map((country) => {
    const currencies = Object.keys(country.currencies ?? {});
    const code = country.cca2.toUpperCase();

    return {
      code,
      name: country.name.common,
      flag: country.flag || countryFlag(code),
      currencies: currencies.length > 0 ? currencies : ["USD"],
      searchText: [
        country.name.common,
        country.name.official,
        country.cca2,
        country.cca3,
        country.region,
        country.subregion,
        ...(country.altSpellings ?? []),
        ...currencies,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
  })
  .sort((first, second) => first.name.localeCompare(second.name));

const countryCurrencyMap = new Map<string, CurrencyOption>();

for (const country of worldCountries) {
  for (const [code, currency] of Object.entries(country.currencies ?? {})) {
    countryCurrencyMap.set(code, {
      code,
      name: currencyName(code, currency.name),
      symbol: currencySymbol(code, currency.symbol),
      searchText: [code, currency.name, currency.symbol]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    });
  }
}

const supportedCurrencyCodes =
  (
    Intl as unknown as { supportedValuesOf?: (key: "currency") => string[] }
  ).supportedValuesOf?.("currency") ?? [];

for (const code of supportedCurrencyCodes) {
  if (!countryCurrencyMap.has(code)) {
    const name = currencyName(code);
    const symbol = currencySymbol(code);

    countryCurrencyMap.set(code, {
      code,
      name,
      symbol,
      searchText: [code, name, symbol].join(" ").toLowerCase(),
    });
  }
}

const currencyOptions: CurrencyOption[] = Array.from(
  countryCurrencyMap.values(),
)
  .filter((currency) => /^[A-Z]{3}$/.test(currency.code))
  .sort((first, second) => first.code.localeCompare(second.code));

function SearchableSelect({
  id,
  label,
  value,
  options,
  onChange,
  placeholder,
  emptyMessage,
}: {
  id: string;
  label: string;
  value: string;
  options: SearchableOption[];
  onChange: (value: string) => void;
  placeholder: string;
  emptyMessage: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedOption =
    options.find((option) => option.value === value) ?? options[0];
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) =>
      option.searchText.includes(normalizedQuery),
    );
  }, [options, query]);

  function handleSelect(nextValue: string) {
    onChange(nextValue);
    setQuery("");
    setIsOpen(false);
  }

  return (
    <div className="grid gap-2 text-sm font-medium text-text">
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <button
          id={id}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left text-base font-normal text-text outline-none transition hover:border-text-soft focus:border-primary"
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={`${id}-listbox`}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selectedOption.leading ? (
              <span className="shrink-0 text-lg leading-none">
                {selectedOption.leading}
              </span>
            ) : null}
            <span className="truncate">{selectedOption.label}</span>
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-text-soft"
            strokeWidth={1.9}
            aria-hidden="true"
          />
        </button>

        <AnimatePresence>
          {isOpen ? (
            <motion.div
              className="absolute left-0 right-0 top-12 z-30 rounded-lg border border-border bg-surface p-2 shadow-[0_16px_44px_rgba(15,23,42,0.12)]"
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
              <div className="relative mb-2">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-soft"
                  strokeWidth={1.9}
                  aria-hidden="true"
                />
                <input
                  className="min-h-10 w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm font-normal text-text outline-none transition placeholder:text-text-soft focus:border-primary"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setIsOpen(false);
                    }
                  }}
                  placeholder={placeholder}
                  autoFocus
                />
              </div>
              <div
                id={`${id}-listbox`}
                role="listbox"
                className="max-h-60 overflow-y-auto pr-1"
              >
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option) => {
                    const isSelected = option.value === value;

                    return (
                      <button
                        key={option.value}
                        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition ${
                          isSelected
                            ? "bg-surface-muted text-text"
                            : "text-text-muted hover:bg-surface-muted hover:text-text"
                        }`}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelect(option.value)}
                      >
                        {option.leading ? (
                          <span className="w-7 shrink-0 text-lg leading-none">
                            {option.leading}
                          </span>
                        ) : null}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {option.label}
                          </span>
                          {option.meta ? (
                            <span className="mt-0.5 block truncate text-xs text-text-soft">
                              {option.meta}
                            </span>
                          ) : null}
                        </span>
                        {isSelected ? (
                          <Check
                            className="size-4 shrink-0 text-primary"
                            strokeWidth={1.9}
                            aria-hidden="true"
                          />
                        ) : null}
                      </button>
                    );
                  })
                ) : (
                  <p className="px-3 py-4 text-sm text-text-soft">
                    {emptyMessage}
                  </p>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function getRedirectPath() {
  const nextPath = new URLSearchParams(window.location.search).get("next");

  if (nextPath?.startsWith("/") && !nextPath.startsWith("//")) {
    return nextPath;
  }

  return "/";
}

export default function OnboardingPage() {
  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState("US");
  const [currency, setCurrency] = useState("USD");
  const [step, setStep] = useState<"name" | "country" | "currency">("name");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedCountry = useMemo(
    () =>
      countryOptions.find((item) => item.code === country) ?? countryOptions[0],
    [country],
  );
  const selectedCurrency = useMemo(
    () =>
      currencyOptions.find((item) => item.code === currency) ??
      currencyOptions[0],
    [currency],
  );
  const countrySelectOptions = useMemo<SearchableOption[]>(
    () =>
      countryOptions.map((item) => ({
        value: item.code,
        label: item.name,
        leading: item.flag,
        meta: item.currencies.join(", "),
        searchText: item.searchText,
      })),
    [],
  );
  const currencySelectOptions = useMemo<SearchableOption[]>(
    () =>
      currencyOptions.map((item) => ({
        value: item.code,
        label: `${item.code} - ${item.name}`,
        leading: item.symbol,
        meta: item.symbol === item.code ? undefined : item.symbol,
        searchText: item.searchText,
      })),
    [],
  );

  function handleCountryChange(nextCountry: string) {
    const matchedCountry =
      countryOptions.find((item) => item.code === nextCountry) ??
      countryOptions[0];

    setCountry(matchedCountry.code);
    setCurrency(matchedCountry.currencies[0] ?? "USD");
    setError("");
  }

  function handleNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!displayName.trim()) {
      setError("Tell us what to call you.");
      return;
    }

    setError("");
    setStep("country");
  }

  function handleCountrySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const matchedCountry =
      countryOptions.find((item) => item.code === country) ?? countryOptions[0];

    setCountry(matchedCountry.code);
    setCurrency(matchedCountry.currencies[0] ?? currency);
    setError("");
    setStep("currency");
  }

  async function handleCurrencySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = onboardingSchema.safeParse({
      displayName,
      country,
      currency,
    });

    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Complete onboarding to continue.",
      );
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/app/me/onboarding", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsed.data),
      });

      if (!response.ok) {
        throw new Error("Could not save onboarding. Please try again.");
      }

      const nextPath = getRedirectPath();
      const welcomeUrl = new URL("/welcome", window.location.origin);

      if (nextPath !== "/") {
        welcomeUrl.searchParams.set("next", nextPath);
      }

      window.location.assign(welcomeUrl.toString());
    } catch (submitError) {
      setIsSubmitting(false);
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not save onboarding.",
      );
    }
  }

  return (
    <main className="h-dvh overflow-hidden bg-background text-text">
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm font-semibold text-text">
            <span className="grid size-8 place-items-center rounded-md border border-border bg-surface text-sm font-bold">
              C
            </span>
            Cocobaa
          </div>
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-muted">
            First run setup
          </span>
        </header>

        <section className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-8">
            <motion.div
              className="flex gap-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <div className="grid size-8 shrink-0 place-items-center rounded-md bg-text text-xs font-semibold text-surface">
                AI
              </div>
              <div className="grid max-w-170 gap-3">
                <div className="rounded-lg bg-surface-muted px-4 py-3 text-base leading-7 text-text">
                  Welcome to Cocobaa. I will set up the basics before your first
                  budget chat.
                </div>
              </div>
            </motion.div>

            <motion.div
              className="flex gap-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.22, ease: "easeOut" }}
            >
              <div className="grid size-8 shrink-0 place-items-center rounded-md bg-text text-xs font-semibold text-surface">
                AI
              </div>
              <div className="grid max-w-170 gap-3">
                <div className="rounded-lg bg-surface-muted px-4 py-3 text-base leading-7 text-text">
                  What should we call you?
                </div>
                {step === "name" ? (
                  <motion.form
                    className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm"
                    onSubmit={handleNameSubmit}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    noValidate
                  >
                    <label
                      className="grid gap-2 text-sm font-medium text-text"
                      htmlFor="displayName"
                    >
                      Preferred name
                      <input
                        id="displayName"
                        className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-base font-normal text-text outline-none transition placeholder:text-text-soft focus:border-primary"
                        value={displayName}
                        onChange={(event) => {
                          setDisplayName(event.target.value);
                          setError("");
                        }}
                        placeholder="Your full name"
                        autoComplete="given-name"
                        aria-invalid={Boolean(error && !displayName.trim())}
                      />
                    </label>
                    <AnimatePresence>
                      {error ? (
                        <motion.p
                          role="alert"
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.16, ease: "easeOut" }}
                        >
                          {error}
                        </motion.p>
                      ) : null}
                    </AnimatePresence>
                    <motion.button
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-text px-4 text-sm font-semibold text-surface transition hover:bg-slate-700"
                      type="submit"
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Continue
                    </motion.button>
                  </motion.form>
                ) : null}
              </div>
            </motion.div>

            {step !== "name" ? (
              <motion.div
                className="flex justify-end"
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <div className="max-w-155 rounded-lg bg-primary px-4 py-3 text-base leading-7 text-white">
                  You can call me {displayName.trim()}.
                </div>
              </motion.div>
            ) : null}

            {step !== "name" ? (
              <motion.div
                className="flex gap-3"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <div className="grid size-8 shrink-0 place-items-center rounded-md bg-text text-xs font-semibold text-surface">
                  AI
                </div>
                <div className="grid max-w-170 gap-3">
                  <div className="rounded-lg bg-surface-muted px-4 py-3 text-base leading-7 text-text">
                    Nice to meet you, {displayName.trim()}. What country are you
                    from?
                  </div>
                  {step === "country" ? (
                    <motion.form
                      className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm"
                      onSubmit={handleCountrySubmit}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                    >
                      <SearchableSelect
                        id="country"
                        label="Country"
                        value={country}
                        options={countrySelectOptions}
                        onChange={handleCountryChange}
                        placeholder="Search countries"
                        emptyMessage="No countries found."
                      />
                      <motion.button
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-text px-4 text-sm font-semibold text-surface transition hover:bg-slate-700"
                        type="submit"
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        Continue
                      </motion.button>
                    </motion.form>
                  ) : null}
                </div>
              </motion.div>
            ) : null}

            {step === "currency" ? (
              <>
                <motion.div
                  className="flex justify-end"
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <div className="max-w-155 rounded-lg bg-primary px-4 py-3 text-base leading-7 text-white">
                    I am from {selectedCountry.flag} {selectedCountry.name}.
                  </div>
                </motion.div>

                <motion.div
                  className="flex gap-3"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                >
                  <div className="grid size-8 shrink-0 place-items-center rounded-md bg-text text-xs font-semibold text-surface">
                    AI
                  </div>
                  <div className="grid max-w-170 gap-3">
                    <div className="rounded-lg bg-surface-muted px-4 py-3 text-base leading-7 text-text">
                      Your default currency looks like {selectedCurrency.symbol}{" "}
                      {selectedCurrency.code} - {selectedCurrency.name}. Keep it
                      or change it before we continue.
                    </div>
                    <motion.form
                      className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm"
                      onSubmit={handleCurrencySubmit}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                    >
                      <SearchableSelect
                        id="currency"
                        label="Currency"
                        value={currency}
                        options={currencySelectOptions}
                        onChange={setCurrency}
                        placeholder="Search currencies"
                        emptyMessage="No currencies found."
                      />
                      <div className="rounded-lg bg-surface-muted px-3 py-3 text-sm text-text-muted">
                        <span className="font-medium text-text">Preview:</span>{" "}
                        {displayName.trim()} in {selectedCountry.flag}{" "}
                        {selectedCountry.name}, using {selectedCurrency.symbol}{" "}
                        {selectedCurrency.code}.
                      </div>
                      <AnimatePresence>
                        {error ? (
                          <motion.p
                            role="alert"
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.16, ease: "easeOut" }}
                          >
                            {error}
                          </motion.p>
                        ) : null}
                      </AnimatePresence>
                      <motion.button
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-text px-4 text-sm font-semibold text-surface transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        type="submit"
                        disabled={isSubmitting}
                        whileHover={!isSubmitting ? { y: -1 } : undefined}
                        whileTap={!isSubmitting ? { scale: 0.98 } : undefined}
                      >
                        {isSubmitting ? (
                          <LoaderCircle
                            className="size-4 animate-spin"
                            strokeWidth={1.9}
                            aria-hidden="true"
                          />
                        ) : (
                          <CheckCircle2
                            className="size-4"
                            strokeWidth={1.9}
                            aria-hidden="true"
                          />
                        )}
                        Continue to Cocobaa
                      </motion.button>
                    </motion.form>
                  </div>
                </motion.div>
              </>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
