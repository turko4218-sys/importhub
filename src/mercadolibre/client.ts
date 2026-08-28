import axios, { AxiosError } from "axios";
import { config } from "../config.js";
import { getValidAccessToken } from "./auth.js";
import type { MercadoLibreItemPayload } from "./mapper.js";

const API_BASE = "https://api.mercadolibre.com";

export class MercadoLibreApiError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const tokens = await getValidAccessToken();
  return { Authorization: `Bearer ${tokens.accessToken}` };
}

function unwrapAxiosError(error: unknown): never {
  if (error instanceof AxiosError) {
    const message = error.response?.data?.message ?? error.response?.data ?? error.message;
    throw new MercadoLibreApiError(`Error de la API de MercadoLibre: ${JSON.stringify(message)}`, error.response?.data);
  }
  throw error;
}

/** Sugiere una categoria de MercadoLibre a partir del titulo del producto. */
export async function predictCategory(title: string): Promise<string> {
  try {
    const response = await axios.get(`${API_BASE}/sites/${config.mercadolibre.siteId}/domain_discovery/search`, {
      params: { limit: 1, q: title },
    });
    const suggestion = response.data?.[0]?.category_id;
    if (!suggestion) {
      throw new MercadoLibreApiError(`No se pudo predecir una categoria para: "${title}"`);
    }
    return suggestion as string;
  } catch (error) {
    if (error instanceof MercadoLibreApiError) throw error;
    unwrapAxiosError(error);
  }
}

export interface PublishResult {
  itemId: string;
  permalink: string;
}

export async function publishItem(payload: MercadoLibreItemPayload): Promise<PublishResult> {
  try {
    const headers = await authHeaders();
    const response = await axios.post(`${API_BASE}/items`, payload, { headers });
    return { itemId: response.data.id, permalink: response.data.permalink };
  } catch (error) {
    unwrapAxiosError(error);
  }
}

export async function getMyUserId(): Promise<number> {
  try {
    const headers = await authHeaders();
    const response = await axios.get(`${API_BASE}/users/me`, { headers });
    return response.data.id;
  } catch (error) {
    unwrapAxiosError(error);
  }
}
