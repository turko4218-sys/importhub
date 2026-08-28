import { describe, expect, it } from "vitest";
import { convertPrice, mapListingToMercadoLibreItem } from "../src/mercadolibre/mapper.js";
import type { Listing } from "../src/types.js";

function buildListing(overrides: Partial<Listing> = {}): Listing {
  return {
    title: "Auriculares inalambricos con cancelacion de ruido de alta calidad para uso diario",
    brand: "AcmeSound",
    model: "AS-100",
    barcode: "0123456789012",
    priceUsd: 100,
    weightKg: 0.25,
    shippingCostUsd: 7,
    availableOnAmazon: true,
    images: ["https://m.media-amazon.com/images/I/71abc.jpg"],
    description: "Unos auriculares muy buenos.",
    videos: [],
    ...overrides,
  };
}

describe("convertPrice", () => {
  it("aplica fx + margen sobre el precio y solo fx sobre el envio (default fx=1, markup=30%)", () => {
    // (100 * 1 * 1.3) + (7 * 1) = 137
    expect(convertPrice(100, 7)).toBe(137);
  });

  it("funciona sin costo de envio", () => {
    expect(convertPrice(100)).toBe(130);
  });
});

describe("mapListingToMercadoLibreItem", () => {
  it("mapea un listing editado a un payload valido de MercadoLibre", () => {
    const listing = buildListing();
    const payload = mapListingToMercadoLibreItem(listing, "MLA1055", "https://amazon.com/dp/X");

    expect(payload.category_id).toBe("MLA1055");
    expect(payload.price).toBe(137);
    expect(payload.pictures).toEqual([{ source: listing.images[0] }]);
    expect(payload.attributes).toContainEqual({ id: "BRAND", value_name: "AcmeSound" });
    expect(payload.attributes).toContainEqual({ id: "MODEL", value_name: "AS-100" });
    expect(payload.attributes).toContainEqual({ id: "GTIN", value_name: "0123456789012" });
    expect(payload.description.plain_text).toContain("https://amazon.com/dp/X");
    expect(payload.title.length).toBeLessThanOrEqual(60);
  });

  it("trunca titulos de mas de 60 caracteres", () => {
    const listing = buildListing({ title: "A".repeat(80) });
    const payload = mapListingToMercadoLibreItem(listing, "MLA1055");
    expect(payload.title.length).toBe(60);
  });

  it("pone stock en 0 si no esta disponible en Amazon", () => {
    const listing = buildListing({ availableOnAmazon: false });
    const payload = mapListingToMercadoLibreItem(listing, "MLA1055");
    expect(payload.available_quantity).toBe(0);
  });

  it("lanza un error si el listing no tiene precio", () => {
    const listing = buildListing({ priceUsd: null });
    expect(() => mapListingToMercadoLibreItem(listing, "MLA1055")).toThrow(/precio/i);
  });

  it("lanza un error si el listing no tiene imagenes", () => {
    const listing = buildListing({ images: [] });
    expect(() => mapListingToMercadoLibreItem(listing, "MLA1055")).toThrow(/imagenes/i);
  });
});
