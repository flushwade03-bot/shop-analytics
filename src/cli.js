import fs from "node:fs/promises";
import { getConfig } from "./config.js";
import { etsyRequest } from "./etsy.js";
import { readTokens } from "./token-store.js";

const config = getConfig();
const [command, ...args] = process.argv.slice(2);

function options(values) {
  return Object.fromEntries(values.filter((value) => value.startsWith("--") && value.includes("=")).map((value) => value.slice(2).split(/=(.*)/s, 2)));
}

async function ownShopId() {
  if (/^\d+$/.test(config.shopId)) return config.shopId;
  const tokens = await readTokens();
  const userId = tokens?.access_token?.split(".", 1)[0] || process.env.ETSY_ACCESS_TOKEN?.split(".", 1)[0];
  if (!/^\d+$/.test(userId || "")) throw new Error("ETSY_SHOP_IDを設定するか、OAuthアクセストークンを用意してください。");
  const shop = await etsyRequest(config, `/v3/application/users/${userId}/shops`);
  if (!shop?.shop_id) throw new Error("認証ユーザーのショップが見つかりません。");
  return String(shop.shop_id);
}

function paging(values) {
  const parsed = options(values);
  return { limit: Math.min(Math.max(Number(parsed.limit || 25), 1), 100), offset: Math.max(Number(parsed.offset || 0), 0) };
}

async function salesSummary(values) {
  const parsed = options(values);
  const query = { limit: 100, offset: 0, min_created: parsed.min_created, max_created: parsed.max_created };
  const receipts = [];
  const shopId = await ownShopId();
  do {
    const page = await etsyRequest(config, `/v3/application/shops/${shopId}/receipts`, { query, authenticated: true });
    receipts.push(...(page.results || []));
    query.offset += page.results?.length || 0;
    if (!page.results?.length || receipts.length >= page.count) break;
  } while (receipts.length < 12_000);

  const revenueByCurrency = {};
  let paid = 0;
  let shipped = 0;
  for (const receipt of receipts) {
    if (receipt.is_paid || receipt.was_paid) paid += 1;
    if (receipt.is_shipped || receipt.was_shipped) shipped += 1;
    const money = receipt.grandtotal || receipt.total_price;
    if (money?.currency_code && Number(money.divisor)) {
      revenueByCurrency[money.currency_code] = (revenueByCurrency[money.currency_code] || 0) + Number(money.amount) / Number(money.divisor);
    }
  }
  return { receiptCount: receipts.length, paidCount: paid, shippedCount: shipped, revenueByCurrency, minCreated: parsed.min_created || null, maxCreated: parsed.max_created || null };
}

async function readJson(file) {
  if (!file) throw new Error("JSONファイルのパスを指定してください。");
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function main() {
  switch (command) {
    case "sales-summary":
      return salesSummary(args);
    case "my-listings": {
      const query = { ...paging(args), state: options(args).state || "active" };
      return etsyRequest(config, `/v3/application/shops/${await ownShopId()}/listings`, { query, authenticated: true });
    }
    case "create-listing":
      return etsyRequest(config, `/v3/application/shops/${await ownShopId()}/listings`, { method: "POST", body: await readJson(args[0]), authenticated: true });
    case "update-listing": {
      if (!/^\d+$/.test(args[0] || "")) throw new Error("listing_idを数値で指定してください。");
      return etsyRequest(config, `/v3/application/shops/${await ownShopId()}/listings/${args[0]}`, { method: "PATCH", body: await readJson(args[1]), authenticated: true });
    }
    case "public-shop": {
      if (!/^\d+$/.test(args[0] || "")) throw new Error("shop_idを数値で指定してください。");
      return etsyRequest(config, `/v3/application/shops/${args[0]}`);
    }
    case "public-listings": {
      if (!/^\d+$/.test(args[0] || "")) throw new Error("shop_idを数値で指定してください。");
      return etsyRequest(config, `/v3/application/shops/${args[0]}/listings/active`, { query: paging(args.slice(1)) });
    }
    case "search":
      return etsyRequest(config, "/v3/application/listings/active", { query: { ...paging(args), keywords: options(args).keywords } });
    default:
      throw new Error("Usage: sales-summary | my-listings | create-listing FILE | update-listing ID FILE | public-shop ID | public-listings ID | search --keywords=...");
  }
}

main().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
  console.error(JSON.stringify({ error: error.message, status: error.status, details: error.details }));
  process.exitCode = 1;
});
