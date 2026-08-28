import axios from "axios";
import { config } from "../config.js";
import { loadTokens, saveTokens, type StoredTokens } from "./tokenStore.js";

const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

export function buildAuthorizationUrl(state: string): string {
  const url = new URL(`https://auth.mercadolibre.com.ar/authorization`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.mercadolibre.clientId);
  url.searchParams.set("redirect_uri", config.mercadolibre.redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCodeForTokens(code: string): Promise<StoredTokens> {
  const response = await axios.post(TOKEN_URL, null, {
    params: {
      grant_type: "authorization_code",
      client_id: config.mercadolibre.clientId,
      client_secret: config.mercadolibre.clientSecret,
      code,
      redirect_uri: config.mercadolibre.redirectUri,
    },
  });

  const tokens: StoredTokens = {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token,
    expiresAt: Date.now() + response.data.expires_in * 1000,
    userId: response.data.user_id ?? null,
  };
  saveTokens(tokens);
  return tokens;
}

async function refreshTokens(refreshToken: string): Promise<StoredTokens> {
  const response = await axios.post(TOKEN_URL, null, {
    params: {
      grant_type: "refresh_token",
      client_id: config.mercadolibre.clientId,
      client_secret: config.mercadolibre.clientSecret,
      refresh_token: refreshToken,
    },
  });

  const tokens: StoredTokens = {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token,
    expiresAt: Date.now() + response.data.expires_in * 1000,
    userId: response.data.user_id ?? null,
  };
  saveTokens(tokens);
  return tokens;
}

export async function getValidAccessToken(): Promise<StoredTokens> {
  let tokens = loadTokens();

  if (!tokens) {
    if (!config.mercadolibre.refreshToken) {
      throw new Error(
        "No hay tokens de MercadoLibre guardados. Ejecuta `npm run ml:auth` para autorizar la app la primera vez."
      );
    }
    tokens = await refreshTokens(config.mercadolibre.refreshToken);
  }

  if (Date.now() >= tokens.expiresAt - EXPIRY_SAFETY_MARGIN_MS) {
    tokens = await refreshTokens(tokens.refreshToken);
  }

  return tokens;
}
