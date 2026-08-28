import { describe, expect, it } from "vitest";
import { estimateShippingCostUsd, buildInitialListing } from "../src/services/listing.js";
import type { ScrapedProduct } from "../src/types.js";

describe("estimateShippingCostUsd", () => {
  it("calcula costo base + por kg (defaults: base=5, 8/kg)", () => {
    expect(estimateShippingCostUsd(0.25)).toBe(7);
    expect(estimateShippingCostUsd(1)).toBe(13);
  });

  it("retorna null si no hay peso", () => {
    expect(estimateShippingCostUsd(null)).toBeNull();
  });
});

describe("buildInitialListing", () => {
  it("copia los datos scrapeados y estima el envio por peso", () => {
    const product: ScrapedProduct = {
      sourceUrl: "https://amazon.com/dp/X",
      asin: "X",
      title: "Producto de prueba",
      brand: "Marca",
      model: "M1",
      barcode: "123",
      price: 50,
      currency: "USD",
      weightKg: 0.5,
      images: ["https://example.com/1.jpg"],
      videos: [],
      description: "Descripcion",
      bulletPoints: [],
      specifications: {},
      rating: null,
      ratingCount: null,
      availability: "En stock",
      inStock: true,
      scrapedAt: new Date().toISOString(),
    };

    const listing = buildInitialListing(product);
    expect(listing.priceUsd).toBe(50);
    expect(listing.shippingCostUsd).toBe(9);
    expect(listing.availableOnAmazon).toBe(true);
    expect(listing.images).toEqual(product.images);
  });
});
