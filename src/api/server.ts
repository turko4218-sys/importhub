import express from "express";
import cors from "cors";
import { z } from "zod";
import { config } from "../config.js";
import { enqueueAmazonUrl, enqueueAmazonUrls } from "../queue/queue.js";
import { getJob, listJobs, updateJob } from "../db/jobStore.js";
import { publishScrapedProduct } from "../mercadolibre/publishProduct.js";

const app = express();
app.use(cors());
app.use(express.json());

const enqueueSchema = z
  .object({
    url: z.string().url().optional(),
    urls: z.array(z.string().url()).optional(),
    autoPublish: z.boolean().optional(),
  })
  .refine((body) => body.url || (body.urls && body.urls.length > 0), {
    message: "Debes enviar 'url' o 'urls'",
  });

app.post("/api/jobs", async (req, res) => {
  const parsed = enqueueSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { url, urls, autoPublish } = parsed.data;

  try {
    if (urls && urls.length > 0) {
      const jobs = await enqueueAmazonUrls(urls, { autoPublish });
      return res.status(201).json({ jobs });
    }
    const job = await enqueueAmazonUrl(url!, { autoPublish });
    return res.status(201).json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
});

app.get("/api/jobs", (req, res) => {
  const limit = Number(req.query.limit ?? 50);
  res.json({ jobs: listJobs(limit) });
});

app.get("/api/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job no encontrado" });
  res.json({ job });
});

/** Publica manualmente un job que quedo en estado 'scraped' (cuando autoPublish=false). */
app.post("/api/jobs/:id/publish", async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job no encontrado" });
  if (!job.product) {
    return res.status(409).json({ error: "El job todavia no tiene datos scrapeados" });
  }
  if (job.status === "published") {
    return res.status(409).json({ error: "El job ya fue publicado", mercadolibre: job.mercadolibre });
  }

  try {
    updateJob(job.id, { status: "publishing" });
    const mercadolibre = await publishScrapedProduct(job.product);
    const updated = updateJob(job.id, { status: "published", mercadolibre });
    res.json({ job: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateJob(job.id, { status: "failed", error: message });
    res.status(500).json({ error: message });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(config.port, () => {
  console.log(`[api] Escuchando en http://localhost:${config.port}`);
});
