import { Worker, type Job } from "bullmq";
import { config } from "../config.js";
import { connection, QUEUE_NAME, enqueueAmazonUrls, type AmazonImportJobData } from "./queue.js";
import { scrapeAmazonProduct, extractProductLinksFromListing, ScrapeError } from "../scraper/amazonScraper.js";
import { publishListing } from "../mercadolibre/publishProduct.js";
import { buildInitialListing } from "../services/listing.js";
import { getJob, updateJob } from "../db/jobStore.js";

async function processListingJob(jobId: string, url: string, autoPublish: boolean): Promise<void> {
  console.log(`[worker] Expandiendo listado ${jobId} -> ${url}`);
  updateJob(jobId, { status: "scraping" });

  const productUrls = await extractProductLinksFromListing(url);
  if (productUrls.length === 0) {
    throw new ScrapeError("No se encontraron productos en esa pagina de Amazon.");
  }

  const childJobs = await enqueueAmazonUrls(productUrls, { autoPublish });
  updateJob(jobId, { status: "expanded", childJobIds: childJobs.map((job) => job.id) });
  console.log(`[worker] Listado expandido: ${childJobs.length} productos encolados`);
}

async function processProductJob(jobId: string, url: string, autoPublish: boolean): Promise<void> {
  console.log(`[worker] Procesando ${jobId} -> ${url}`);
  updateJob(jobId, { status: "scraping" });

  const product = await scrapeAmazonProduct(url);
  const listing = buildInitialListing(product);
  updateJob(jobId, { status: "scraped", product, listing });
  console.log(`[worker] Scraping OK: "${product.title}" (${product.images.length} imagenes)`);

  if (!autoPublish) {
    console.log(`[worker] autoPublish=false, dejo el job en estado 'scraped' para revisar/publicar manualmente`);
    return;
  }

  updateJob(jobId, { status: "publishing" });
  const mercadolibre = await publishListing(listing);

  updateJob(jobId, { status: "published", mercadolibre });
  console.log(`[worker] Publicado en MercadoLibre: ${mercadolibre.permalink}`);
}

async function processImportJob(job: Job<AmazonImportJobData>): Promise<void> {
  const { jobId, url, autoPublish } = job.data;
  const record = getJob(jobId);

  if (record?.kind === "listing") {
    await processListingJob(jobId, url, autoPublish);
  } else {
    await processProductJob(jobId, url, autoPublish);
  }
}

const worker = new Worker<AmazonImportJobData>(
  QUEUE_NAME,
  async (job) => {
    try {
      await processImportJob(job);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateJob(job.data.jobId, { status: "failed", error: message });
      throw error;
    }
  },
  { connection, concurrency: config.queueConcurrency }
);

worker.on("failed", (job, error) => {
  console.error(`[worker] Job ${job?.id} fallo: ${error.message}`);
});

worker.on("ready", () => {
  console.log(`[worker] Escuchando la cola "${QUEUE_NAME}" con concurrencia ${config.queueConcurrency}`);
});

process.on("SIGINT", async () => {
  await worker.close();
  process.exit(0);
});
