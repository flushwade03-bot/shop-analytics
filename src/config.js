import fs from "node:fs";
import path from "node:path";

export function loadEnv(file = path.resolve(".env")) {
  if (!fs.existsSync(file)) return;

  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

export function getConfig({ requireSecrets = true } = {}) {
  loadEnv();
  const config = {
    apiKey: process.env.ETSY_API_KEY?.trim() ?? "",
    sharedSecret: process.env.ETSY_SHARED_SECRET?.trim() ?? "",
    redirectUri: process.env.ETSY_REDIRECT_URI?.trim() ?? "",
    shopId: process.env.ETSY_SHOP_ID?.trim() ?? "",
    port: Number(process.env.PORT || 3000),
    scopes: ["transactions_r", "listings_r", "listings_w"],
  };

  if (requireSecrets) {
    const missing = [];
    if (!config.apiKey) missing.push("ETSY_API_KEY");
    if (!config.sharedSecret) missing.push("ETSY_SHARED_SECRET");
    if (!config.redirectUri) missing.push("ETSY_REDIRECT_URI");
    if (missing.length) throw new Error(`.env に未入力の項目があります: ${missing.join(", ")}`);
    const callback = new URL(config.redirectUri);
    if (callback.protocol !== "https:" && !(callback.protocol === "http:" && ["localhost", "127.0.0.1"].includes(callback.hostname))) {
      throw new Error("ETSY_REDIRECT_URI は HTTPS、またはローカル開発用の http://localhost URL にしてください。");
    }
    if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error("PORT が不正です。");
  }
  return config;
}
