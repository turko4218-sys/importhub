import "dotenv/config";

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(optional("PORT", "3000")),

  redisUrl: optional("REDIS_URL", "redis://localhost:6379"),
  queueConcurrency: Number(optional("QUEUE_CONCURRENCY", "1")),

  scraper: {
    userAgent: optional(
      "SCRAPER_USER_AGENT",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    minDelayMs: Number(optional("SCRAPER_MIN_DELAY_MS", "1500")),
    maxDelayMs: Number(optional("SCRAPER_MAX_DELAY_MS", "4000")),
    proxyUrl: optional("SCRAPER_PROXY_URL"),
    // Ruta a un binario de Chromium ya instalado. Util cuando el entorno
    // trae un Chromium propio y la version de Playwright instalada no
    // coincide con la que este pre-instalada (evita que intente descargar).
    chromiumExecutablePath: optional("PLAYWRIGHT_CHROMIUM_PATH"),
  },

  mercadolibre: {
    get clientId() {
      return required("ML_CLIENT_ID");
    },
    get clientSecret() {
      return required("ML_CLIENT_SECRET");
    },
    redirectUri: optional("ML_REDIRECT_URI", "https://localhost/callback"),
    refreshToken: optional("ML_REFRESH_TOKEN"),
    siteId: optional("ML_SITE_ID", "MLA"),
    userId: optional("ML_USER_ID"),
    listingTypeId: optional("ML_LISTING_TYPE_ID", "gold_special"),
    condition: optional("ML_CONDITION", "new"),
    defaultQuantity: Number(optional("ML_DEFAULT_QUANTITY", "1")),
    shippingMode: optional("ML_SHIPPING_MODE", "not_specified"),
  },

  pricing: {
    fxRate: Number(optional("PRICE_FX_RATE", "1")),
    markupPercent: Number(optional("PRICE_MARKUP_PERCENT", "30")),
  },

  shipping: {
    // Estimacion por defecto del costo de envio internacional (USD) cuando
    // no se edita manualmente en el panel de revision.
    costPerKgUsd: Number(optional("INTL_SHIPPING_COST_PER_KG", "8")),
    baseCostUsd: Number(optional("INTL_SHIPPING_BASE_COST_USD", "5")),
  },

  autoPublish: optional("AUTO_PUBLISH", "false").toLowerCase() === "true",

  dbPath: optional("DB_PATH", "data/importhub.sqlite"),
};
