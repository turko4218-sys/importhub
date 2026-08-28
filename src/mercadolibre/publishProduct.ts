import type { Listing, JobRecord } from "../types.js";
import { predictCategory, publishItem } from "./client.js";
import { mapListingToMercadoLibreItem } from "./mapper.js";

export async function publishListing(
  listing: Listing,
  sourceUrl?: string
): Promise<NonNullable<JobRecord["mercadolibre"]>> {
  const categoryId = await predictCategory(listing.title);
  const payload = mapListingToMercadoLibreItem(listing, categoryId, sourceUrl);
  const result = await publishItem(payload);

  return {
    itemId: result.itemId,
    permalink: result.permalink,
    categoryId,
    price: payload.price,
    currencyId: payload.currency_id,
  };
}
