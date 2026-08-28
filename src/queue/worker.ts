import { Worker, type Job } from "bullmq";
import { config } from "../config.js";
import { connection, QUEUE_NAME, type AmazonImportJobData } from "./queue.js";
import { scrapeAmazonProduct } from "../scraper/amazonScraper.js";
import { publishScrapedProduct } from "../mercadolibre/publishProduct.js";
import { updateJob } from "../db/jobStore.js";

async function processImportJob(job: Job<AmazonImportJobData>): Promise<void> {
  const { jobId, url, autoPublish } = job.data;

  console.log(`[worker] Procesando ${jobId} -> ${url}`);
  updateJob(jobId, { status: "scraping" });

  const product = await scrapeAmazonProduct(url);
  updateJob(jobId, { status: "scraped", product });
  console.log(`[worker] Scraping OK: "${product.title}" (${product.images.length} imagenes)`);

  if (!autoPublish) {
    console.log(`[worker] autoPublish=false, dejo el job en estado 'scraped' para publicacion manual`);
    return;
  }

  updateJob(jobId, { status: "publishing" });
  const mercadolibre = await publishScrapedProduct(product);

  updateJob(jobId, { status: "published", mercadolibre });
  console.log(`[worker] Publicado en MercadoLibre: ${mercadolibre.permalink}`);
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
