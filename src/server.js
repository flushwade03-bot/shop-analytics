import http from "node:http";
import crypto from "node:crypto";
import { getConfig } from "./config.js";
import { etsyRequest, exchangeCode } from "./etsy.js";
import { readTokens } from "./token-store.js";

const config = getConfig();
const callbackPath = new URL(config.redirectUri).pathname;
const oauthAttempts = new Map();

function send(response, status, value, contentType = "application/json; charset=utf-8") {
  const body = contentType.startsWith("application/json") ? JSON.stringify(value, null, 2) : value;
  response.writeHead(status, { "content-type": contentType, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(body);
}

async function jsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw Object.assign(new Error("Request body is too large"), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw Object.assign(new Error("JSON body is invalid"), { status: 400 }); }
}

async function ownShopId() {
  if (/^\d+$/.test(config.shopId)) return config.shopId;
  const tokens = await readTokens();
  const userId = tokens?.access_token?.split(".", 1)[0];
  if (!/^\d+$/.test(userId || "")) throw Object.assign(new Error("ショップIDを自動取得するには、先にOAuth認証を完了してください。"), { status: 401 });
  const shop = await etsyRequest(config, `/v3/application/users/${userId}/shops`);
  if (!shop?.shop_id) throw Object.assign(new Error("認証したEtsyユーザーのショップが見つかりません。"), { status: 404 });
  return String(shop.shop_id);
}

function pageQuery(url) {
  return {
    limit: Math.min(Math.max(Number(url.searchParams.get("limit") || 25), 1), 100),
    offset: Math.max(Number(url.searchParams.get("offset") || 0), 0),
  };
}

function beginOAuth(response) {
  const state = crypto.randomBytes(32).toString("base64url");
  const verifier = crypto.randomBytes(64).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  oauthAttempts.set(state, { verifier, expiresAt: Date.now() + 10 * 60_000 });
  const authorization = new URL("https://www.etsy.com/oauth/connect");
  authorization.search = new URLSearchParams({
    response_type: "code",
    client_id: config.apiKey,
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  response.writeHead(302, { location: authorization.toString(), "cache-control": "no-store" });
  response.end();
}

async function finishOAuth(url, response) {
  if (url.searchParams.get("error")) throw Object.assign(new Error(url.searchParams.get("error_description") || url.searchParams.get("error")), { status: 400 });
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const attempt = state && oauthAttempts.get(state);
  if (!attempt || attempt.expiresAt < Date.now()) throw Object.assign(new Error("OAuth stateが無効または期限切れです。認証を最初からやり直してください。"), { status: 400 });
  oauthAttempts.delete(state);
  if (!code) throw Object.assign(new Error("認証コードがありません。"), { status: 400 });
  await exchangeCode(config, code, attempt.verifier);
  send(response, 200, "Etsy OAuth認証が完了しました。このタブを閉じて構いません。", "text/plain; charset=utf-8");
}

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/") return send(response, 200, { service: "shop-analytics", oauth: "/auth/etsy", status: "/auth/status" });
  if (request.method === "GET" && url.pathname === "/auth/etsy") return beginOAuth(response);
  if (request.method === "GET" && [callbackPath, "/auth/etsy/callback"].includes(url.pathname)) return finishOAuth(url, response);
  if (request.method === "GET" && url.pathname === "/auth/status") {
    const tokens = await readTokens();
    return send(response, 200, { authenticated: Boolean(tokens), expiresAt: tokens?.expires_at ? new Date(tokens.expires_at).toISOString() : null, scopes: tokens?.scope || null });
  }

  if (request.method === "GET" && url.pathname === "/api/me/sales") {
    const query = pageQuery(url);
    for (const name of ["min_created", "max_created", "was_paid", "was_shipped"]) query[name] = url.searchParams.get(name) || undefined;
    return send(response, 200, await etsyRequest(config, `/v3/application/shops/${await ownShopId()}/receipts`, { query, authenticated: true }));
  }
  if (request.method === "GET" && url.pathname === "/api/me/listings") {
    const query = { ...pageQuery(url), state: url.searchParams.get("state") || "active" };
    return send(response, 200, await etsyRequest(config, `/v3/application/shops/${await ownShopId()}/listings`, { query, authenticated: true }));
  }
  if (request.method === "POST" && url.pathname === "/api/me/listings") {
    return send(response, 201, await etsyRequest(config, `/v3/application/shops/${await ownShopId()}/listings`, { method: "POST", body: await jsonBody(request), authenticated: true }));
  }
  if (request.method === "PATCH" && parts.length === 4 && parts.slice(0, 3).join("/") === "api/me/listings" && /^\d+$/.test(parts[3])) {
    return send(response, 200, await etsyRequest(config, `/v3/application/shops/${await ownShopId()}/listings/${parts[3]}`, { method: "PATCH", body: await jsonBody(request), authenticated: true }));
  }

  if (request.method === "GET" && parts.length === 4 && parts.slice(0, 3).join("/") === "api/public/shops" && /^\d+$/.test(parts[3])) {
    return send(response, 200, await etsyRequest(config, `/v3/application/shops/${parts[3]}`));
  }
  if (request.method === "GET" && parts.length === 5 && parts.slice(0, 3).join("/") === "api/public/shops" && parts[4] === "listings" && /^\d+$/.test(parts[3])) {
    return send(response, 200, await etsyRequest(config, `/v3/application/shops/${parts[3]}/listings/active`, { query: pageQuery(url) }));
  }
  if (request.method === "GET" && url.pathname === "/api/public/listings/search") {
    const query = { ...pageQuery(url), keywords: url.searchParams.get("keywords") || undefined };
    return send(response, 200, await etsyRequest(config, "/v3/application/listings/active", { query }));
  }
  send(response, 404, { error: "Not found" });
}

const server = http.createServer((request, response) => {
  route(request, response).catch((error) => {
    console.error(`[${new Date().toISOString()}] ${error.message}`);
    send(response, Number(error.status) || 500, { error: error.message, details: error.details || undefined });
  });
});

server.listen(config.port, "127.0.0.1", () => {
  console.log(`shop-analytics: http://localhost:${config.port}`);
  console.log(`OAuth開始: http://localhost:${config.port}/auth/etsy`);
});
