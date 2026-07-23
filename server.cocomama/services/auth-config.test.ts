import { describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";

describe("auth configuration", () => {
  it("uses database-backed auth sessions", () => {
    expect(env.AUTH_STORAGE_MODE).toBe("database");
  });
});
