import fs from "node:fs/promises";
import path from "node:path";

const tokenFile = path.resolve(".data", "etsy-oauth.json");

export async function readTokens() {
  try {
    return JSON.parse(await fs.readFile(tokenFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function writeTokens(response) {
  const tokens = {
    access_token: response.access_token,
    refresh_token: response.refresh_token,
    scope: response.scope,
    expires_at: Date.now() + Number(response.expires_in) * 1000,
  };
  await fs.mkdir(path.dirname(tokenFile), { recursive: true });
  const temporary = `${tokenFile}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(tokens, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, tokenFile);
  return tokens;
}

export async function seedTokensFromEnvironment() {
  const refreshToken = process.env.ETSY_REFRESH_TOKEN?.trim();
  if (!refreshToken) return null;
  return writeTokens({
    access_token: process.env.ETSY_ACCESS_TOKEN?.trim() || "",
    refresh_token: refreshToken,
    scope: process.env.ETSY_TOKEN_SCOPE?.trim() || "transactions_r listings_r listings_w",
    expires_in: process.env.ETSY_ACCESS_TOKEN?.trim() ? 3000 : 0,
  });
}
