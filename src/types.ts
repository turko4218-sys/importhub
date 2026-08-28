export interface ScrapedProduct {
  sourceUrl: string;
  asin: string | null;
  title: string;
  brand: string | null;
  model: string | null;
  barcode: string | null;
  price: number | null;
  currency: string | null;
  weightKg: number | null;
  images: string[];
  videos: string[];
  description: string;
  bulletPoints: string[];
  specifications: Record<string, string>;
  rating: number | null;
  ratingCount: number | null;
  availability: string | null;
  inStock: boolean;
  scrapedAt: string;
}

/**
 * Copia editable de lo scrapeado. Se crea apenas termina el scraping y es
 * lo que se muestra/edita en el panel de revision antes de publicar; el
 * ScrapedProduct original queda intacto como referencia.
 */
export interface Listing {
  title: string;
  brand: string | null;
  model: string | null;
  barcode: string | null;
  priceUsd: number | null;
  weightKg: number | null;
  shippingCostUsd: number | null;
  availableOnAmazon: boolean;
  images: string[];
  description: string;
  videos: string[];
}

export type JobStatus =
  | "queued"
  | "scraping"
  | "scraped"
  | "publishing"
  | "published"
  | "expanded"
  | "failed";

export type JobKind = "product" | "listing";

export interface JobRecord {
  id: string;
  url: string;
  kind: JobKind;
  status: JobStatus;
  error: string | null;
  product: ScrapedProduct | null;
  listing: Listing | null;
  /** Solo para jobs de tipo "listing": los jobs de producto que se encolaron a partir de esta pagina. */
  childJobIds: string[] | null;
  mercadolibre: {
    itemId: string | null;
    permalink: string | null;
    categoryId: string | null;
    price: number | null;
    currencyId: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnqueueOptions {
  autoPublish?: boolean;
}
