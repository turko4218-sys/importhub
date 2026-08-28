import { readFileSync } from "node:fs";
import { amazonImportQueue, connection, enqueueAmazonUrls } from "../queue/queue.js";

function printUsage(): void {
  console.log(`Uso:
  npm run enqueue -- https://www.amazon.com/dp/XXXXXXX
  npm run enqueue -- https://amazon.com/dp/AAA https://amazon.com/dp/BBB
  npm run enqueue -- --file urls.txt   (una URL por linea)
  npm run enqueue -- --no-publish https://amazon.com/dp/AAA   (solo scrapear, no publicar)
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  let autoPublish: boolean | undefined;
  const filtered: string[] = [];
  let fileArg: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--no-publish") {
      autoPublish = false;
    } else if (arg === "--publish") {
      autoPublish = true;
    } else if (arg === "--file") {
      fileArg = args[i + 1];
      i++;
    } else {
      filtered.push(arg);
    }
  }

  const urls = [...filtered];
  if (fileArg) {
    const lines = readFileSync(fileArg, "utf-8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
    urls.push(...lines);
  }

  if (urls.length === 0) {
    printUsage();
    process.exit(1);
  }

  console.log(`Encolando ${urls.length} URL(s)...`);
  const jobs = await enqueueAmazonUrls(urls, { autoPublish });
  for (const job of jobs) {
    console.log(`  [${job.id}] ${job.url} -> ${job.status}`);
  }

  await amazonImportQueue.close();
  await connection.quit();
}

main().catch((error) => {
  console.error("Error al encolar:", error);
  process.exit(1);
});
