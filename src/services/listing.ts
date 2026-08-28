import { config } from "../config.js";
import type { Listing, ScrapedProduct } from "../types.js";

/** Estima el costo de envio internacional en USD a partir del peso. */
export function estimateShippingCostUsd(weightKg: number | null): number | null {
  if (weightKg === null) return null;
  const cost = config.shipping.baseCostUsd + weightKg * config.shipping.costPerKgUsd;
  return Math.round(cost * 100) / 100;
}

/** Construye la copia editable (listing) apenas termina el scraping. */
export function buildInitialListing(product: ScrapedProduct): Listing {
  return {
    title: product.title,
    brand: product.brand,
    model: product.model,
    barcode: product.barcode,
    priceUsd: product.price,
    weightKg: product.weightKg,
    shippingCostUsd: estimateShippingCostUsd(product.weightKg),
    availableOnAmazon: product.inStock,
    images: product.images,
    description: product.description,
    videos: product.videos,
  };
}
