import { describe, expect, it } from "vitest";
import {
  extractAsinFromUrl,
  extractAsinsFromHrefs,
  extractBarcode,
  extractModel,
  isListingUrl,
  parsePrice,
  parseRating,
  parseWeightKg,
  toHighResImage,
} from "../src/scraper/amazonScraper.js";

describe("extractAsinFromUrl", () => {
  it("extrae el ASIN de una URL /dp/", () => {
    expect(extractAsinFromUrl("https://www.amazon.com/Some-Product/dp/B08N5WRWNW/ref=sr_1_1")).toBe(
      "B08N5WRWNW"
    );
  });

  it("extrae el ASIN de una URL /gp/product/", () => {
    expect(extractAsinFromUrl("https://www.amazon.com/gp/product/B08N5WRWNW")).toBe("B08N5WRWNW");
  });

  it("retorna null si no encuentra ASIN", () => {
    expect(extractAsinFromUrl("https://www.amazon.com/s?k=zapatos")).toBeNull();
  });
});

describe("isListingUrl", () => {
  it("una pagina de producto (con ASIN) no es un listado", () => {
    expect(isListingUrl("https://www.amazon.com/Some-Product/dp/B08N5WRWNW")).toBe(false);
  });

  it("una busqueda es un listado", () => {
    expect(isListingUrl("https://www.amazon.com/s?k=zapatos")).toBe(true);
  });

  it("una pagina de mas vendidos es un listado", () => {
    expect(isListingUrl("https://www.amazon.com/gp/bestsellers/electronics")).toBe(true);
  });

  it("una tienda de marca es un listado", () => {
    expect(isListingUrl("https://www.amazon.com/stores/AcmeSound/page/abc123")).toBe(true);
  });
});

describe("extractAsinsFromHrefs", () => {
  it("saca los ASIN unicos de una lista de hrefs, ignorando duplicados y links sin ASIN", () => {
    const hrefs = [
      "/Some-Product/dp/B08N5WRWNW/ref=sr_1_1",
      "/Some-Product/dp/B08N5WRWNW/ref=sr_1_2", // mismo producto, distinto ref
      "/gp/product/B0C1234567",
      "/s?k=otra+busqueda",
      "/gp/help/customer/display.html",
    ];
    expect(extractAsinsFromHrefs(hrefs)).toEqual(["B08N5WRWNW", "B0C1234567"]);
  });

  it("retorna una lista vacia si no hay ningun link de producto", () => {
    expect(extractAsinsFromHrefs(["/s?k=x", "/gp/help"])).toEqual([]);
  });
});

describe("parsePrice", () => {
  it("parsea un precio en dolares", () => {
    expect(parsePrice("$29.99")).toEqual({ price: 29.99, currency: "USD" });
  });

  it("parsea un precio con separador de miles y coma decimal", () => {
    expect(parsePrice("US$1.234,56")).toEqual({ price: 1234.56, currency: "USD" });
  });

  it("retorna nulos si no hay texto de precio", () => {
    expect(parsePrice(null)).toEqual({ price: null, currency: null });
  });
});

describe("parseRating", () => {
  it("parsea rating en ingles", () => {
    expect(parseRating("4.5 out of 5 stars")).toBe(4.5);
  });

  it("parsea rating en espanol", () => {
    expect(parseRating("4,2 de 5 estrellas")).toBe(4.2);
  });

  it("retorna null si no hay match", () => {
    expect(parseRating("Sin calificaciones")).toBeNull();
  });
});

describe("extractModel", () => {
  it("encuentra el modelo en la tabla de especificaciones", () => {
    expect(extractModel({ Modelo: "AS-100", Color: "Negro" })).toBe("AS-100");
    expect(extractModel({ "Item model number": "AS-100" })).toBe("AS-100");
  });

  it("retorna null si no hay modelo", () => {
    expect(extractModel({ Color: "Negro" })).toBeNull();
  });
});

describe("extractBarcode", () => {
  it("encuentra y limpia un UPC/EAN", () => {
    expect(extractBarcode({ UPC: "012-345-678901" })).toBe("012345678901");
  });

  it("retorna null si no hay codigo de barras", () => {
    expect(extractBarcode({ Color: "Negro" })).toBeNull();
  });
});

describe("parseWeightKg", () => {
  it("convierte gramos a kg", () => {
    expect(parseWeightKg({ "Peso del articulo": "250 g" })).toBe(0.25);
  });

  it("convierte libras a kg", () => {
    expect(parseWeightKg({ "Item Weight": "1.5 pounds" })).toBeCloseTo(0.680, 2);
  });

  it("retorna null si no hay peso reconocible", () => {
    expect(parseWeightKg({ Color: "Negro" })).toBeNull();
  });
});

describe("toHighResImage", () => {
  it("quita el sufijo de tamano de una URL de imagen de Amazon", () => {
    expect(toHighResImage("https://m.media-amazon.com/images/I/71abc._AC_SX679_.jpg")).toBe(
      "https://m.media-amazon.com/images/I/71abc.jpg"
    );
  });

  it("deja igual una URL sin sufijo de tamano", () => {
    expect(toHighResImage("https://m.media-amazon.com/images/I/71abc.jpg")).toBe(
      "https://m.media-amazon.com/images/I/71abc.jpg"
    );
  });
});
