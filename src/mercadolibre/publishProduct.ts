import type { ScrapedProduct, JobRecord } from "../types.js";
import { predictCategory, publishItem } from "./client.js";
import { mapProductToMercadoLibreItem } from "./mapper.js";

export async function publishScrapedProduct(product: ScrapedProduct): Promise<NonNullable<JobRecord["mercadolibre"]>> {
  const categoryId = await predictCategory(product.title);
  const payload = mapProductToMercadoLibreItem(product, categoryId);
  const result = await publishItem(payload);

  return {
    itemId: result.itemId,
    permalink: result.permalink,
    categoryId,
    price: payload.price,
    currencyId: payload.currency_id,
  };
}
