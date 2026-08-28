export interface ScrapedProduct {
  sourceUrl: string;
  asin: string | null;
  title: string;
  brand: string | null;
  price: number | null;
  currency: string | null;
  images: string[];
  description: string;
  bulletPoints: string[];
  specifications: Record<string, string>;
  rating: number | null;
  ratingCount: number | null;
  availability: string | null;
  scrapedAt: string;
}

export type JobStatus =
  | "queued"
  | "scraping"
  | "scraped"
  | "publishing"
  | "published"
  | "failed";

export interface JobRecord {
  id: string;
  url: string;
  status: JobStatus;
  error: string | null;
  product: ScrapedProduct | null;
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
