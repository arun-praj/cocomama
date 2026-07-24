import { inferSpecificExpenseCategoryName } from "./expense-category-inference-service.js";

export interface ParsedExpenseMessage {
  type: "expense";
  amount: string;
  category: string;
  title: string;
  description: string;
  merchant?: string;
}

const amountPattern =
  /(?:rs\.?|npr|रु)\s*([0-9]+(?:\.[0-9]{1,2})?)|([0-9]+(?:\.[0-9]{1,2})?)\s*(?:rs\.?|npr|रु)/i;

const titleCase = (value: string) =>
  value
    .split(" ")
    .filter(Boolean)
    .map(
      (part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`,
    )
    .join(" ");

const cleanItemName = (value: string) =>
  value
    .replace(/\b(a|an|the|new|pair|of)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const inferCategory = (itemName: string) => {
  const specificCategory = inferSpecificExpenseCategoryName([itemName]);

  if (specificCategory) {
    return specificCategory.toLowerCase();
  }

  if (
    /headphone|headset|earphone|earbud|laptop|phone|charger|electronics?/i.test(
      itemName,
    )
  ) {
    return "electronics";
  }

  if (/shoe|shirt|pant|jacket|clothing/i.test(itemName)) {
    return "clothing";
  }

  return "other";
};

const extractItemName = (message: string) => {
  const boughtMatch = message.match(
    /\bbought\b\s+(.+?)(?:\s+(?:at|from)\s+(?!rs\.?|npr|रु).+?(?:\s+for\s+(?:rs\.?|npr|रु)|$)|\s+(?:at|for)\s+(?:rs\.?|npr|रु)|$)/i,
  );
  const rawItemName = boughtMatch?.[1] ?? "expense";
  return cleanItemName(rawItemName);
};

const extractMerchantName = (message: string) => {
  const merchantMatch = message.match(
    /\b(?:at|from)\s+(?!rs\.?\b|npr\b|रु)(.+?)(?:\s+(?:for|at)\s+(?:rs\.?|npr|रु)|$)/i,
  );

  return merchantMatch?.[1]?.replace(/\s+/g, " ").trim();
};

export const parseExpenseMessage = (message: string): ParsedExpenseMessage => {
  const amountMatch = message.match(amountPattern);
  const amount = amountMatch?.[1] ?? amountMatch?.[2];

  if (!amount) {
    throw new Error("Could not find an Rs/NPR amount in the message");
  }

  const itemName = extractItemName(message);
  const merchant = extractMerchantName(message);
  const title = titleCase(itemName || "expense");

  return {
    type: "expense",
    amount,
    category: inferCategory(itemName),
    title,
    description: merchant ? `${title} at ${merchant}` : title,
    ...(merchant ? { merchant } : {}),
  };
};
