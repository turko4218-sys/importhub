import { config } from "../config.js";
import type { ScrapedProduct } from "../types.js";
import { currencyForSite } from "./siteCurrency.js";

const TITLE_MAX_LENGTH = 60;

export interface MercadoLibreItemPayload {
  title: string;
  category_id: string;
  price: number;
  currency_id: string;
  available_quantity: number;
  buying_mode: "buy_it_now";
  condition: string;
  listing_type_id: string;
  description: { plain_text: string };
  pictures: { source: string }[];
  attributes: { id: string; value_name: string }[];
  shipping: { mode: string };
}

/** Convierte el precio scrapeado (usualmente en USD) al precio final en la moneda del sitio de ML. */
export function convertPrice(amazonPrice: number): number {
  const converted = amazonPrice * config.pricing.fxRate;
  const withMarkup = converted * (1 + config.pricing.markupPercent / 100);
  return Math.round(withMarkup * 100) / 100;
}

function buildDescription(product: ScrapedProduct): string {
  const parts: string[] = [];
  if (product.bulletPoints.length > 0) {
    parts.push(product.bulletPoints.map((line) => `• ${line}`).join("\n"));
  }
  if (product.description) {
    parts.push(product.description);
  }
  const specEntries = Object.entries(product.specifications);
  if (specEntries.length > 0) {
    parts.push(["Especificaciones:", ...specEntries.map(([key, value]) => `- ${key}: ${value}`)].join("\n"));
  }
  parts.push(`Fuente original: ${product.sourceUrl}`);
  return parts.join("\n\n").trim();
}

function truncateTitle(title: string): string {
  return title.length > TITLE_MAX_LENGTH ? `${title.slice(0, TITLE_MAX_LENGTH - 1)}…` : title;
}

export function mapProductToMercadoLibreItem(
  product: ScrapedProduct,
  categoryId: string
): MercadoLibreItemPayload {
  if (product.price === null) {
    throw new Error("El producto no tiene precio detectado; no se puede publicar en MercadoLibre.");
  }
  if (product.images.length === 0) {
    throw new Error("El producto no tiene imagenes detectadas; no se puede publicar en MercadoLibre.");
  }

  const attributes: { id: string; value_name: string }[] = [];
  if (product.brand) {
    attributes.push({ id: "BRAND", value_name: product.brand });
  }

  return {
    title: truncateTitle(product.title),
    category_id: categoryId,
    price: convertPrice(product.price),
    currency_id: currencyForSite(config.mercadolibre.siteId),
    available_quantity: config.mercadolibre.defaultQuantity,
    buying_mode: "buy_it_now",
    condition: config.mercadolibre.condition,
    listing_type_id: config.mercadolibre.listingTypeId,
    description: { plain_text: buildDescription(product) },
    pictures: product.images.map((source) => ({ source })),
    attributes,
    shipping: { mode: config.mercadolibre.shippingMode },
  };
}
