import test from "node:test";
import assert from "node:assert/strict";
import { getOwnShop, getOwnShopId, userIdFromAccessToken } from "../src/etsy.js";

test("extracts the Etsy user ID without exposing the rest of the access token", () => {
  assert.equal(userIdFromAccessToken("12345678.opaque-value"), "12345678");
  assert.throws(() => userIdFromAccessToken("invalid"), { status: 401 });
});

test("gets the authenticated user's shop when no shop ID is configured", async () => {
  const calls = [];
  const shop = await getOwnShop(
    { shopId: "" },
    {
      getAccessToken: async () => "12345678.opaque-value",
      request: async (...args) => {
        calls.push(args);
        return { shop_id: 87654321, title: "My shop" };
      },
    },
  );

  assert.equal(shop.shop_id, 87654321);
  assert.deepEqual(calls, [[{ shopId: "" }, "/v3/application/users/12345678/shops", { authenticated: true }]]);
});

test("gets and validates a configured shop ID with OAuth authentication", async () => {
  const dependencies = {
    getAccessToken: async () => assert.fail("configured shop IDs do not need token parsing"),
    request: async (_config, path, options) => {
      assert.equal(path, "/v3/application/shops/87654321");
      assert.deepEqual(options, { authenticated: true });
      return { shop_id: 87654321 };
    },
  };

  assert.equal(await getOwnShopId({ shopId: "87654321" }, dependencies), "87654321");
});

test("reports an authenticated account without a shop", async () => {
  await assert.rejects(
    getOwnShopId({ shopId: "" }, {
      getAccessToken: async () => "12345678.opaque-value",
      request: async () => ({}),
    }),
    { status: 404 },
  );
});
