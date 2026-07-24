const specificExpenseCategoryRules = [
  {
    category: "Clothing",
    pattern:
      /\b(t-?shirts?|shirts?|clothing|clothes|apparel|jeans|pants?|trousers?|jackets?|hoodies?|dresses?|skirts?|shoes?|sneakers?|socks?)\b/i,
  },
  {
    category: "Plants",
    pattern:
      /\b(plants?(?!-)|houseplants?|seedlings?|saplings?|flowers?|flower pots?|potting soil|nursery|garden plants?)\b/i,
  },
] as const;

export const inferSpecificExpenseCategoryName = (
  candidates: Array<string | undefined | null>,
) => {
  const candidateText = candidates.filter(Boolean).join(" ");

  return specificExpenseCategoryRules.find((rule) =>
    rule.pattern.test(candidateText),
  )?.category;
};
