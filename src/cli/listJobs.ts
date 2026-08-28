import { listJobs } from "../db/jobStore.js";

const limit = Number(process.argv[2] ?? 20);
const jobs = listJobs(limit);

if (jobs.length === 0) {
  console.log("No hay jobs todavia.");
} else {
  for (const job of jobs) {
    const title =
      job.kind === "listing"
        ? `[LISTADO]${job.childJobIds ? ` ${job.childJobIds.length} productos encolados` : ""}`
        : job.product?.title ?? "(sin scrapear aun)";
    const permalink = job.mercadolibre?.permalink ?? "";
    console.log(`[${job.status.toUpperCase()}] ${job.id}  ${title}`);
    console.log(`   url:    ${job.url}`);
    if (permalink) console.log(`   ml:     ${permalink}`);
    if (job.error) console.log(`   error:  ${job.error}`);
    console.log("");
  }
}
