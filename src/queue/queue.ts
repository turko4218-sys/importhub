import { Queue } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { nanoid } from "nanoid";
import { config } from "../config.js";
import { createJob } from "../db/jobStore.js";
import type { EnqueueOptions, JobRecord } from "../types.js";

export const QUEUE_NAME = "amazon-import";

export const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

export const amazonImportQueue = new Queue(QUEUE_NAME, { connection });

export interface AmazonImportJobData {
  jobId: string;
  url: string;
  autoPublish: boolean;
}

/** Encola una URL de producto de Amazon para ser scrapeada y opcionalmente publicada en MercadoLibre. */
export async function enqueueAmazonUrl(url: string, options: EnqueueOptions = {}): Promise<JobRecord> {
  const jobId = nanoid();
  const record = createJob(jobId, url);

  const data: AmazonImportJobData = {
    jobId,
    url,
    autoPublish: options.autoPublish ?? config.autoPublish,
  };

  await amazonImportQueue.add("import", data, {
    jobId,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 200 },
  });

  return record;
}

/** Encola varias URLs en lote, respetando el orden de entrada. */
export async function enqueueAmazonUrls(urls: string[], options: EnqueueOptions = {}): Promise<JobRecord[]> {
  const records: JobRecord[] = [];
  for (const url of urls) {
    records.push(await enqueueAmazonUrl(url, options));
  }
  return records;
}
