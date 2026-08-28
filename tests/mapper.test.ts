import { describe, expect, it } from "vitest";
import { convertPrice, mapProductToMercadoLibreItem } from "../src/mercadolibre/mapper.js";
import type { ScrapedProduct } from "../src/types.js";

function buildProduct(overrides: Partial<ScrapedProduct> = {}): ScrapedProduct {
  return {
    sourceUrl: "https://www.amazon.com/dp/B08N5WRWNW",
    asin: "B08N5WRWNW",
    title: "Auriculares inalambricos con cancelacion de ruido de alta calidad para uso diario",
    brand: "AcmeSound",
    price: 100,
    currency: "USD",
    images: ["https://m.media-amazon.com/images/I/71abc.jpg"],
    description: "Unos auriculares muy buenos.",
    bulletPoints: ["Bluetooth 5.0", "20 horas de bateria"],
    specifications: { Color: "Negro", Peso: "250g" },
    rating: 4.5,
    ratingCount: 1200,
    availability: "En stock",
    scrapedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("convertPrice", () => {
  it("aplica la tasa de cambio y el margen configurados (default fxRate=1, markup=30%)", () => {
    expect(convertPrice(100)).toBe(130);
  });
});

describe("mapProductToMercadoLibreItem", () => {
  it("mapea un producto scrapeado a un payload valido de MercadoLibre", () => {
    const product = buildProduct();
    const payload = mapProductToMercadoLibreItem(product, "MLA1055");

    expect(payload.category_id).toBe("MLA1055");
    expect(payload.price).toBe(130);
    expect(payload.pictures).toEqual([{ source: product.images[0] }]);
    expect(payload.attributes).toContainEqual({ id: "BRAND", value_name: "AcmeSound" });
    expect(payload.description.plain_text).toContain("Bluetooth 5.0");
    expect(payload.description.plain_text).toContain(product.sourceUrl);
    expect(payload.title.length).toBeLessThanOrEqual(60);
  });

  it("trunca titulos de mas de 60 caracteres", () => {
    const longTitle = "A".repeat(80);
    const product = buildProduct({ title: longTitle });
    const payload = mapProductToMercadoLibreItem(product, "MLA1055");
    expect(payload.title.length).toBe(60);
  });

  it("lanza un error si el producto no tiene precio", () => {
    const product = buildProduct({ price: null });
    expect(() => mapProductToMercadoLibreItem(product, "MLA1055")).toThrow(/precio/i);
  });

  it("lanza un error si el producto no tiene imagenes", () => {
    const product = buildProduct({ images: [] });
    expect(() => mapProductToMercadoLibreItem(product, "MLA1055")).toThrow(/imagenes/i);
  });
});
