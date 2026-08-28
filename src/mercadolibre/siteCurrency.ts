/** Moneda oficial de cada sitio de MercadoLibre. */
export const SITE_CURRENCY: Record<string, string> = {
  MLA: "ARS",
  MLB: "BRL",
  MLM: "MXN",
  MCO: "COP",
  MLC: "CLP",
  MLU: "UYU",
  MPE: "PEN",
  MLV: "USD",
  MEC: "USD",
  MBO: "BOB",
  MPA: "USD",
  MPY: "PYG",
  MCR: "USD",
  MGT: "GTQ",
  MHN: "HNL",
  MNI: "NIO",
  MSV: "USD",
  MRD: "DOP",
};

export function currencyForSite(siteId: string): string {
  return SITE_CURRENCY[siteId] ?? "USD";
}
