import { config } from "../config.js";
import type { Listing } from "../types.js";
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

/**
 * Precio final en la moneda del sitio de ML:
 * (precio del producto * tasa de cambio * (1 + margen)) + costo de envio
 * internacional convertido (sin margen adicional sobre el envio).
 */
export function convertPrice(priceUsd: number, shippingCostUsd = 0): number {
  const productConverted = priceUsd * config.pricing.fxRate * (1 + config.pricing.markupPercent / 100);
  const shippingConverted = shippingCostUsd * config.pricing.fxRate;
  return Math.round((productConverted + shippingConverted) * 100) / 100;
}

function buildDescription(listing: Listing, sourceUrl?: string): string {
  const parts: string[] = [];
  if (listing.description) {
    parts.push(listing.description);
  }
  const details: string[] = [];
  if (listing.model) details.push(`Modelo: ${listing.model}`);
  if (listing.barcode) details.push(`Codigo de barras: ${listing.barcode}`);
  if (listing.weightKg) details.push(`Peso: ${listing.weightKg} kg`);
  if (details.length > 0) parts.push(details.join("\n"));
  if (sourceUrl) parts.push(`Fuente original: ${sourceUrl}`);
  return parts.join("\n\n").trim();
}

function truncateTitle(title: string): string {
  return title.length > TITLE_MAX_LENGTH ? `${title.slice(0, TITLE_MAX_LENGTH - 1)}…` : title;
}

export function mapListingToMercadoLibreItem(
  listing: Listing,
  categoryId: string,
  sourceUrl?: string
): MercadoLibreItemPayload {
  if (listing.priceUsd === null) {
    throw new Error("La publicacion no tiene precio cargado; no se puede publicar en MercadoLibre.");
  }
  if (listing.images.length === 0) {
    throw new Error("La publicacion no tiene imagenes cargadas; no se puede publicar en MercadoLibre.");
  }

  const attributes: { id: string; value_name: string }[] = [];
  if (listing.brand) attributes.push({ id: "BRAND", value_name: listing.brand });
  if (listing.model) attributes.push({ id: "MODEL", value_name: listing.model });
  if (listing.barcode) attributes.push({ id: "GTIN", value_name: listing.barcode });

  return {
    title: truncateTitle(listing.title),
    category_id: categoryId,
    price: convertPrice(listing.priceUsd, listing.shippingCostUsd ?? 0),
    currency_id: currencyForSite(config.mercadolibre.siteId),
    available_quantity: listing.availableOnAmazon ? config.mercadolibre.defaultQuantity : 0,
    buying_mode: "buy_it_now",
    condition: config.mercadolibre.condition,
    listing_type_id: config.mercadolibre.listingTypeId,
    description: { plain_text: buildDescription(listing, sourceUrl) },
    pictures: listing.images.map((source) => ({ source })),
    attributes,
    shipping: { mode: config.mercadolibre.shippingMode },
  };
}
