import { describe, expect, it } from "vitest";
import { parseExpenseMessage } from "../src/services/expense-message-parser.js";

describe("expense message parser", () => {
  it("parses the real headphone purchase smoke message", () => {
    expect(
      parseExpenseMessage("I just bought a new pair of headphone at Rs 2000"),
    ).toEqual({
      type: "expense",
      amount: "2000",
      category: "electronics",
      title: "Headphone",
      description: "Headphone",
    });
  });

  it("keeps merchant separate from title and description", () => {
    expect(
      parseExpenseMessage("I bought headphones at Daraz for Rs 500"),
    ).toEqual({
      type: "expense",
      amount: "500",
      category: "electronics",
      title: "Headphones",
      description: "Headphones at Daraz",
      merchant: "Daraz",
    });
  });

  it("infers specific categories for plants and clothing", () => {
    expect(parseExpenseMessage("I bought plants at Rs 450")).toMatchObject({
      category: "plants",
      title: "Plants",
    });
    expect(parseExpenseMessage("I bought a shirt at Rs 900")).toMatchObject({
      category: "clothing",
      title: "Shirt",
    });
  });
});
