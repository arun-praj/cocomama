export type TransactionEmojiType = "expense" | "income" | "savings";

export type TransactionEmojiItem = {
  type: TransactionEmojiType;
  title: string;
  description: string;
  merchant: string | null;
  category: string | null;
  categoryEmoji: string | null;
  savingsInstrument: string | null;
};

const categoryEmojiByName: Record<string, string> = {
  housing: "🏠",
  utilities: "💡",
  "food & dining": "🍽️",
  transportation: "🚗",
  healthcare: "🏥",
  shopping: "🛍️",
  entertainment: "🎬",
  travel: "✈️",
  education: "🎓",
  financial: "🏦",
  "personal care": "💆",
  "family & pets": "👪",
  insurance: "🛡️",
  "business & work": "💼",
  "salary & employment": "💵",
  "freelance & contract work": "🧑‍💻",
  "business income": "🏪",
  "gig economy": "🚲",
  "online sales": "🛒",
  "rental income": "🏘️",
  "investment income": "📈",
  cryptocurrency: "🪙",
  "royalties & licensing": "🎼",
  "content creator income": "🎥",
  "bank rewards & cashback": "💳",
  "refunds & reimbursements": "🔁",
  "government benefits": "🏛️",
  "insurance payouts": "🛡️",
  "education & grants": "🎓",
  "gifts & family support": "🎁",
  "transfers received": "🔄",
  "agriculture & farming": "🚜",
  "prizes & winnings": "🏆",
  "asset sales": "🏷️",
  "legal & settlements": "⚖️",
  "foreign income": "🌍",
  "miscellaneous income": "💰",
  "emergency fund": "🚨",
  "general savings": "🐷",
  "retirement savings": "🌅",
  "investment savings": "📊",
  "education savings": "🎓",
  "home savings": "🏡",
  "vehicle savings": "🚙",
  "travel savings": "🧳",
  "healthcare savings": "🩺",
  "wedding savings": "💍",
  "baby & family savings": "🍼",
  "business savings": "🏢",
  "technology savings": "💻",
  "gift savings": "🎁",
  "tax savings": "🧾",
  "insurance reserve": "🛡️",
  "debt payoff fund": "✅",
  "large purchase fund": "🛋️",
  "pet savings": "🐾",
  "charity savings": "🤝",
  "crypto savings": "🪙",
  "gold & precious metals": "🥇",
  "foreign currency savings": "💱",
  "children's future": "🧒",
  "other goal-based savings": "🎯",
};

const transactionEmojiRules: Array<{
  emoji: string;
  terms: string[];
  type?: TransactionEmojiType;
}> = [
  {
    emoji: "🍽️",
    terms: [
      "food",
      "dining",
      "lunch",
      "dinner",
      "breakfast",
      "restaurant",
      "cafe",
      "coffee",
      "grocery",
      "groceries",
      "pizza",
      "snack",
    ],
  },
  {
    emoji: "🚗",
    terms: [
      "transport",
      "taxi",
      "ride",
      "uber",
      "fuel",
      "bus",
      "train",
      "parking",
      "toll",
    ],
  },
  {
    emoji: "🎬",
    terms: ["movie", "cinema", "netflix", "entertainment", "concert", "game"],
  },
  {
    emoji: "🛍️",
    terms: [
      "shopping",
      "daraz",
      "amazon",
      "clothing",
      "electronics",
      "purchase",
    ],
  },
  { emoji: "🏠", terms: ["rent", "mortgage", "housing", "home", "apartment"] },
  {
    emoji: "💡",
    terms: [
      "electric",
      "water",
      "internet",
      "utility",
      "utilities",
      "phone bill",
    ],
  },
  {
    emoji: "🏥",
    terms: ["doctor", "hospital", "clinic", "medical", "pharmacy", "health"],
  },
  { emoji: "✈️", terms: ["flight", "hotel", "travel", "vacation", "airbnb"] },
  { emoji: "🎓", terms: ["school", "tuition", "education", "course", "book"] },
  {
    emoji: "💵",
    terms: ["salary", "income", "wage", "payment", "bonus"],
    type: "income",
  },
  {
    emoji: "📊",
    terms: ["sip", "investment", "stock", "mutual fund", "brokerage"],
    type: "savings",
  },
  {
    emoji: "🐷",
    terms: ["saving", "savings", "fund", "deposit"],
    type: "savings",
  },
];

const fallbackEmojiByTransactionType = {
  expense: "💳",
  income: "💵",
  savings: "🐷",
} satisfies Record<TransactionEmojiType, string>;

export function resolveCategoryEmoji(
  category: string | null,
  type: TransactionEmojiType,
  providedEmoji: string | null,
) {
  if (providedEmoji?.trim()) {
    return providedEmoji;
  }

  if (category) {
    const mappedEmoji = categoryEmojiByName[category.trim().toLowerCase()];

    if (mappedEmoji) {
      return mappedEmoji;
    }
  }

  if (category) {
    return type === "income" ? "💵" : type === "savings" ? "🐷" : "💳";
  }

  return null;
}

export function resolveTransactionEmoji(item: TransactionEmojiItem) {
  const categoryEmoji = resolveCategoryEmoji(
    item.category,
    item.type,
    item.categoryEmoji,
  );

  if (categoryEmoji) {
    return categoryEmoji;
  }

  const searchableText = [
    item.title,
    item.description,
    item.merchant,
    item.savingsInstrument,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const matchedRule = transactionEmojiRules.find(
    (rule) =>
      (!rule.type || rule.type === item.type) &&
      rule.terms.some((term) => searchableText.includes(term)),
  );

  return matchedRule?.emoji ?? fallbackEmojiByTransactionType[item.type];
}
