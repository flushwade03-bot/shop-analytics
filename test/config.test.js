import test from "node:test";
import assert from "node:assert/strict";
import { getConfig } from "../src/config.js";

test("uses only the required least-privilege scopes", () => {
  const original = { ...process.env };
  Object.assign(process.env, {
    ETSY_API_KEY: "test-key",
    ETSY_SHARED_SECRET: "test-secret",
    ETSY_REDIRECT_URI: "http://localhost:3000/auth/etsy/callback",
    ETSY_SHOP_ID: "123",
    PORT: "3000",
  });
  try {
    assert.deepEqual(getConfig().scopes, ["transactions_r", "listings_r", "listings_w"]);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
});
