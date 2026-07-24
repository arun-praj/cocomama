import type { TransactionType } from "../tools/types.js";

export const defaultCategoryEmoji = "🏷️";

const fallbackCategoryEmojiByKind = {
  expense: "💳",
  income: "💵",
  savings: "🐷",
} satisfies Record<TransactionType, string>;

type CategoryEmojiRule = {
  emoji: string;
  terms: string[];
  kind?: TransactionType;
};

const categoryEmojiRules: CategoryEmojiRule[] = [
  { emoji: "🏠", terms: ["housing", "rent", "mortgage", "apartment"] },
  {
    emoji: "💡",
    terms: ["utilities", "utility", "electric", "water", "internet"],
  },
  { emoji: "🍽️", terms: ["food", "dining", "grocery", "restaurant", "cafe"] },
  {
    emoji: "🚗",
    terms: ["transport", "vehicle", "fuel", "car", "bus", "train"],
  },
  {
    emoji: "👕",
    terms: ["clothing", "shirt", "clothes", "apparel", "pants", "shoes"],
  },
  {
    emoji: "🌱",
    terms: ["plants", "plant", "houseplant", "seedling", "flower", "nursery"],
  },
  {
    emoji: "🏥",
    terms: ["healthcare", "medical", "doctor", "hospital", "clinic"],
  },
  { emoji: "🛍️", terms: ["shopping", "clothing", "electronics", "retail"] },
  {
    emoji: "🎬",
    terms: ["entertainment", "movie", "music", "game", "concert"],
  },
  { emoji: "✈️", terms: ["travel", "flight", "hotel", "vacation"] },
  {
    emoji: "🎓",
    terms: ["education", "school", "tuition", "grant", "scholarship"],
  },
  { emoji: "🏦", terms: ["financial", "finance", "bank", "loan", "account"] },
  { emoji: "💆", terms: ["personal care", "salon", "spa", "fitness"] },
  { emoji: "👪", terms: ["family", "child", "children", "baby"] },
  { emoji: "🐾", terms: ["pet", "pets", "veterinary"] },
  { emoji: "🛡️", terms: ["insurance", "payout", "reserve"] },
  {
    emoji: "💼",
    terms: [
      "business",
      "work",
      "salary",
      "employment",
      "freelance",
      "contract",
    ],
  },
  { emoji: "🏪", terms: ["sales", "store", "commerce", "revenue"] },
  { emoji: "🚲", terms: ["gig", "delivery", "driver"] },
  { emoji: "🏘️", terms: ["rental", "property", "landlord"] },
  { emoji: "📈", terms: ["investment", "dividend", "stock", "brokerage"] },
  { emoji: "🪙", terms: ["crypto", "cryptocurrency", "bitcoin", "ethereum"] },
  { emoji: "🎼", terms: ["royalty", "royalties", "licensing"] },
  { emoji: "🎥", terms: ["creator", "youtube", "content", "podcast"] },
  { emoji: "💳", terms: ["cashback", "reward", "credit card"] },
  { emoji: "🔁", terms: ["refund", "reimbursement"] },
  { emoji: "🏛️", terms: ["government", "benefit", "pension"] },
  { emoji: "🎁", terms: ["gift", "gifts", "holiday", "birthday"] },
  { emoji: "🔄", terms: ["transfer", "remittance"] },
  { emoji: "🚜", terms: ["agriculture", "farm", "farming"] },
  { emoji: "🏆", terms: ["prize", "winning", "lottery"] },
  { emoji: "🏷️", terms: ["asset sale", "large purchase", "purchase"] },
  { emoji: "⚖️", terms: ["legal", "settlement", "court"] },
  { emoji: "🌍", terms: ["foreign", "overseas", "international"] },
  { emoji: "🚨", terms: ["emergency", "rainy day"] },
  { emoji: "🐷", terms: ["general savings", "savings account"] },
  { emoji: "🌅", terms: ["retirement", "401", "ira"] },
  {
    emoji: "🏡",
    terms: ["home savings", "down payment", "home purchase"],
    kind: "savings",
  },
  { emoji: "🚙", terms: ["vehicle savings", "car purchase"], kind: "savings" },
  { emoji: "🧳", terms: ["travel savings", "vacation fund"], kind: "savings" },
  {
    emoji: "🩺",
    terms: ["healthcare savings", "medical fund"],
    kind: "savings",
  },
  { emoji: "💍", terms: ["wedding", "engagement"] },
  {
    emoji: "🏢",
    terms: ["business savings", "startup", "working capital"],
    kind: "savings",
  },
  { emoji: "💻", terms: ["technology", "laptop", "phone", "electronics"] },
  { emoji: "🧾", terms: ["tax", "taxes"] },
  { emoji: "✅", terms: ["debt", "payoff"] },
  { emoji: "🤝", terms: ["charity", "donation", "community"] },
  { emoji: "🥇", terms: ["gold", "precious metal", "silver"] },
  { emoji: "💱", terms: ["foreign currency", "exchange"] },
  { emoji: "🎯", terms: ["goal", "goal-based", "dream project"] },
];

const normalizeCategoryEmojiInput = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

export const resolveCategoryEmoji = ({
  kind,
  name,
}: {
  kind: TransactionType;
  name: string;
}) => {
  const normalizedName = normalizeCategoryEmojiInput(name);
  const matchedRule = categoryEmojiRules.find(
    (rule) =>
      (!rule.kind || rule.kind === kind) &&
      rule.terms.some((term) => normalizedName.includes(term)),
  );

  return (
    matchedRule?.emoji ??
    fallbackCategoryEmojiByKind[kind] ??
    defaultCategoryEmoji
  );
};
