import type { Page } from "playwright";
import { launchBrowser, newContext, humanDelay } from "./browser.js";
import { config } from "../config.js";
import type { ScrapedProduct } from "../types.js";

export class ScrapeError extends Error {}

export function extractAsinFromUrl(url: string): string | null {
  const patterns = [/\/dp\/([A-Z0-9]{10})/, /\/gp\/product\/([A-Z0-9]{10})/, /\/product\/([A-Z0-9]{10})/];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Una URL de Amazon es una "pagina de listado" (busqueda, categoria, mas
 * vendidos, tienda de una marca, etc.) cuando no apunta a un producto
 * puntual, es decir, cuando no se le puede sacar un ASIN.
 */
export function isListingUrl(url: string): boolean {
  return extractAsinFromUrl(url) === null;
}

/** A partir de una lista de hrefs de una pagina, saca los ASIN unicos que encuentra. */
export function extractAsinsFromHrefs(hrefs: string[]): string[] {
  const seen = new Set<string>();
  for (const href of hrefs) {
    const asin = extractAsinFromUrl(href);
    if (asin) seen.add(asin);
  }
  return Array.from(seen);
}

/** Normaliza una URL de miniatura de Amazon a la version de mayor resolucion disponible. */
export function toHighResImage(url: string): string {
  return url.replace(/\._[A-Za-z0-9,_]+_\.(jpg|jpeg|png|webp)/i, ".$1");
}

interface RawExtraction {
  title: string | null;
  brand: string | null;
  priceText: string | null;
  images: string[];
  descriptionParagraphs: string[];
  bulletPoints: string[];
  specifications: Record<string, string>;
  ratingText: string | null;
  ratingCountText: string | null;
  availability: string | null;
  videos: string[];
}

async function extractFromPage(page: Page): Promise<RawExtraction> {
  return page.evaluate(() => {
    const text = (el: Element | null | undefined) => el?.textContent?.trim().replace(/\s+/g, " ") ?? null;

    const title = text(document.querySelector("#productTitle"));

    const brand =
      text(document.querySelector("#bylineInfo")) ??
      text(document.querySelector("a#brand")) ??
      text(document.querySelector("tr.po-brand td.a-span9 span"));

    const priceSelectors = [
      "#corePrice_feature_div .a-price .a-offscreen",
      "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
      "#apex_desktop .a-price .a-offscreen",
      "#price_inside_buybox",
      "#priceblock_ourprice",
      "#priceblock_dealprice",
      ".a-price .a-offscreen",
    ];
    let priceText: string | null = null;
    for (const selector of priceSelectors) {
      const el = document.querySelector(selector);
      if (el && text(el)) {
        priceText = text(el);
        break;
      }
    }

    const images = new Set<string>();
    const dynamicImageHolders = document.querySelectorAll<HTMLElement>(
      "#imgTagWrapperId img, #altImages img, #imageBlock img"
    );
    dynamicImageHolders.forEach((img) => {
      const dynamic = img.getAttribute("data-a-dynamic-image");
      if (dynamic) {
        try {
          const parsed = JSON.parse(dynamic) as Record<string, unknown>;
          Object.keys(parsed).forEach((src) => images.add(src));
        } catch {
          // ignora JSON invalido
        }
      }
      const src = img.getAttribute("src");
      if (src && src.startsWith("http")) images.add(src);
    });

    const descriptionParagraphs = Array.from(
      document.querySelectorAll("#productDescription p, #productDescription span")
    )
      .map((el) => text(el))
      .filter((value): value is string => Boolean(value && value.length > 0));

    const bulletPoints = Array.from(
      document.querySelectorAll("#feature-bullets ul.a-unordered-list li span.a-list-item")
    )
      .map((el) => text(el))
      .filter((value): value is string => Boolean(value && value.length > 0));

    const specifications: Record<string, string> = {};
    document
      .querySelectorAll("#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr")
      .forEach((row) => {
        const key = text(row.querySelector("th"));
        const value = text(row.querySelector("td"));
        if (key && value) specifications[key] = value;
      });
    document.querySelectorAll("#detailBullets_feature_div li").forEach((li) => {
      const spans = li.querySelectorAll("span.a-list-item span");
      if (spans.length >= 2) {
        const key = text(spans[0])?.replace(/:\s*$/, "");
        const value = text(spans[1]);
        if (key && value) specifications[key] = value;
      }
    });

    const ratingText = text(document.querySelector("#acrPopover")) ?? text(document.querySelector("span.a-icon-alt"));
    const ratingCountText = text(document.querySelector("#acrCustomerReviewText"));
    const availability = text(document.querySelector("#availability span")) ?? text(document.querySelector("#availability"));

    const videos = Array.from(
      new Set(
        Array.from(document.querySelectorAll<HTMLElement>("[data-video-url]"))
          .map((el) => el.getAttribute("data-video-url"))
          .filter((value): value is string => Boolean(value))
      )
    );

    return {
      title,
      brand,
      priceText,
      images: Array.from(images),
      descriptionParagraphs,
      bulletPoints,
      specifications,
      ratingText,
      ratingCountText,
      availability,
      videos,
    };
  });
}

export function parsePrice(priceText: string | null): { price: number | null; currency: string | null } {
  if (!priceText) return { price: null, currency: null };

  const currencySymbols: Record<string, string> = {
    "US$": "USD",
    "$": "USD",
    "€": "EUR",
    "£": "GBP",
    "MX$": "MXN",
    "R$": "BRL",
    "ARS$": "ARS",
  };
  let currency: string | null = null;
  for (const [symbol, code] of Object.entries(currencySymbols)) {
    if (priceText.includes(symbol)) {
      currency = code;
      break;
    }
  }

  const numeric = priceText.replace(/[^0-9.,]/g, "");
  let normalized = numeric;
  if (numeric.includes(",") && numeric.includes(".")) {
    normalized = numeric.lastIndexOf(",") > numeric.lastIndexOf(".") ? numeric.replace(/\./g, "").replace(",", ".") : numeric.replace(/,/g, "");
  } else if (numeric.includes(",")) {
    normalized = numeric.replace(",", ".");
  }
  const price = Number.parseFloat(normalized);

  return { price: Number.isFinite(price) ? price : null, currency };
}

export function findSpec(specifications: Record<string, string>, patterns: RegExp[]): string | null {
  for (const [key, value] of Object.entries(specifications)) {
    if (patterns.some((pattern) => pattern.test(key))) return value;
  }
  return null;
}

export function extractModel(specifications: Record<string, string>): string | null {
  return findSpec(specifications, [/^modelo$/i, /numero de modelo/i, /model number/i, /^model$/i]);
}

export function extractBarcode(specifications: Record<string, string>): string | null {
  const raw = findSpec(specifications, [/^upc$/i, /^ean$/i, /^gtin$/i, /codigo de barras/i]);
  return raw ? raw.replace(/[^0-9]/g, "") || raw : null;
}

const WEIGHT_UNIT_TO_KG: Record<string, number> = {
  kg: 1,
  kilogram: 1,
  kilogramos: 1,
  g: 0.001,
  gram: 0.001,
  gramos: 0.001,
  lb: 0.453592,
  lbs: 0.453592,
  pound: 0.453592,
  pounds: 0.453592,
  libras: 0.453592,
  oz: 0.0283495,
  ounce: 0.0283495,
  ounces: 0.0283495,
  onzas: 0.0283495,
};

export function parseWeightKg(specifications: Record<string, string>): number | null {
  const raw = findSpec(specifications, [/peso/i, /weight/i]);
  if (!raw) return null;
  const match = raw.match(/([0-9]+(?:[.,][0-9]+)?)\s*([a-zA-Z]+)/);
  if (!match) return null;
  const value = Number.parseFloat(match[1].replace(",", "."));
  const unit = WEIGHT_UNIT_TO_KG[match[2].toLowerCase()];
  if (!Number.isFinite(value) || !unit) return null;
  return Math.round(value * unit * 1000) / 1000;
}

function cleanBrand(brand: string | null, specifications: Record<string, string>): string | null {
  const fromSpecs = specifications["Marca"] ?? specifications["Brand"];
  if (fromSpecs) return fromSpecs;
  if (!brand) return null;
  return brand
    .replace(/^(visita la tienda de|visit the)\s+/i, "")
    .replace(/\s+(store|tienda)$/i, "")
    .trim();
}

function isInStock(availability: string | null): boolean {
  if (!availability) return true;
  return !/no disponible|agotado|out of stock|currently unavailable|no.?longer available/i.test(availability);
}

export function parseRating(ratingText: string | null): number | null {
  if (!ratingText) return null;
  const match = ratingText.match(/([0-9](?:[.,][0-9])?)\s*(?:out of|de)/i);
  if (!match) return null;
  return Number.parseFloat(match[1].replace(",", "."));
}

function parseRatingCount(ratingCountText: string | null): number | null {
  if (!ratingCountText) return null;
  const digits = ratingCountText.replace(/[^0-9]/g, "");
  return digits ? Number.parseInt(digits, 10) : null;
}

export async function scrapeAmazonProduct(url: string): Promise<ScrapedProduct> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ScrapeError(`URL invalida: ${url}`);
  }
  if (!/amazon\./i.test(parsed.hostname)) {
    throw new ScrapeError(`La URL no parece ser de Amazon: ${url}`);
  }

  const browser = await launchBrowser();
  try {
    const context = await newContext(browser);
    const page = await context.newPage();

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await humanDelay();

    const captchaBlock = await page.$("form[action*='validateCaptcha']");
    if (captchaBlock) {
      throw new ScrapeError("Amazon solicito un captcha; reintenta mas tarde o usa un proxy distinto.");
    }

    const notFound = await page.$("#g");
    const title = await page.$("#productTitle");
    if (!title && notFound) {
      throw new ScrapeError("La pagina de producto no existe o fue removida.");
    }

    const raw = await extractFromPage(page);

    if (!raw.title) {
      throw new ScrapeError("No se pudo extraer el titulo del producto; el layout de la pagina puede haber cambiado.");
    }

    const { price, currency } = parsePrice(raw.priceText);

    const product: ScrapedProduct = {
      sourceUrl: url,
      asin: extractAsinFromUrl(url),
      title: raw.title,
      brand: cleanBrand(raw.brand, raw.specifications),
      model: extractModel(raw.specifications),
      barcode: extractBarcode(raw.specifications),
      price,
      currency,
      weightKg: parseWeightKg(raw.specifications),
      images: raw.images.map(toHighResImage).filter((value, index, all) => all.indexOf(value) === index).slice(0, 12),
      videos: raw.videos,
      description: raw.descriptionParagraphs.join("\n\n"),
      bulletPoints: raw.bulletPoints,
      specifications: raw.specifications,
      rating: parseRating(raw.ratingText),
      ratingCount: parseRatingCount(raw.ratingCountText),
      availability: raw.availability,
      inStock: isInStock(raw.availability),
      scrapedAt: new Date().toISOString(),
    };

    return product;
  } finally {
    await browser.close();
  }
}

/**
 * Carga una pagina de listado de Amazon (busqueda, categoria, mas
 * vendidos, tienda de marca) y devuelve las URLs de producto que
 * encuentra, hasta un maximo configurable.
 */
export async function extractProductLinksFromListing(url: string): Promise<string[]> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ScrapeError(`URL invalida: ${url}`);
  }
  if (!/amazon\./i.test(parsed.hostname)) {
    throw new ScrapeError(`La URL no parece ser de Amazon: ${url}`);
  }

  const browser = await launchBrowser();
  try {
    const context = await newContext(browser);
    const page = await context.newPage();

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await humanDelay();

    const captchaBlock = await page.$("form[action*='validateCaptcha']");
    if (captchaBlock) {
      throw new ScrapeError("Amazon solicito un captcha; reintenta mas tarde o usa un proxy distinto.");
    }

    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/dp/"], a[href*="/gp/product/"]'))
        .map((a) => a.getAttribute("href"))
        .filter((href): href is string => Boolean(href))
    );

    const asins = extractAsinsFromHrefs(hrefs).slice(0, config.scraper.listingMaxProducts);
    return asins.map((asin) => `${parsed.protocol}//${parsed.host}/dp/${asin}`);
  } finally {
    await browser.close();
  }
}
