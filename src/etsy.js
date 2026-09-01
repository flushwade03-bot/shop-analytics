import { readTokens, seedTokensFromEnvironment, writeTokens } from "./token-store.js";

const API_ORIGIN = "https://api.etsy.com";

async function parseResponse(response) {
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!response.ok) {
    const error = new Error(body?.error || `Etsy API error (${response.status})`);
    error.status = response.status;
    error.details = body;
    throw error;
  }
  return body;
}

export async function exchangeCode(config, code, codeVerifier) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.apiKey,
    redirect_uri: config.redirectUri,
    code,
    code_verifier: codeVerifier,
  });
  const response = await fetch(`${API_ORIGIN}/v3/public/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  return writeTokens(await parseResponse(response));
}

async function refresh(config, refreshToken) {
  const response = await fetch(`${API_ORIGIN}/v3/public/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: config.apiKey, refresh_token: refreshToken }),
  });
  return writeTokens(await parseResponse(response));
}

async function validAccessToken(config) {
  let tokens = await readTokens();
  if (!tokens) tokens = await seedTokensFromEnvironment();
  if (!tokens) throw Object.assign(new Error("OAuth認証が未完了です。先に /auth/etsy を開いてください。"), { status: 401 });
  if (Date.now() >= Number(tokens.expires_at) - 60_000) tokens = await refresh(config, tokens.refresh_token);
  return tokens.access_token;
}

export function userIdFromAccessToken(accessToken) {
  const userId = accessToken?.split(".", 1)[0];
  if (!/^\d+$/.test(userId || "")) {
    throw Object.assign(new Error("OAuthアクセストークンからEtsyユーザーIDを確認できません。再認証してください。"), { status: 401 });
  }
  return userId;
}

export async function getOwnShop(config, { request = etsyRequest, getAccessToken = validAccessToken } = {}) {
  if (/^\d+$/.test(config.shopId)) {
    return request(config, `/v3/application/shops/${config.shopId}`, { authenticated: true });
  }

  const userId = userIdFromAccessToken(await getAccessToken(config));
  return request(config, `/v3/application/users/${userId}/shops`, { authenticated: true });
}

export async function getOwnShopId(config, dependencies) {
  const shop = await getOwnShop(config, dependencies);
  if (!/^\d+$/.test(String(shop?.shop_id || ""))) {
    throw Object.assign(new Error("認証したEtsyユーザーのショップが見つかりません。"), { status: 404 });
  }
  return String(shop.shop_id);
}

function formBody(values) {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) value.forEach((item) => result.append(key, String(item)));
    else result.set(key, String(value));
  }
  return result;
}

export async function etsyRequest(config, pathname, { method = "GET", query = {}, body, authenticated = false } = {}) {
  const url = new URL(pathname, API_ORIGIN);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const headers = { "x-api-key": `${config.apiKey}:${config.sharedSecret}` };
  if (authenticated) headers.authorization = `Bearer ${await validAccessToken(config)}`;
  let encodedBody;
  if (body !== undefined) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    encodedBody = formBody(body);
  }
  return parseResponse(await fetch(url, { method, headers, body: encodedBody }));
}
