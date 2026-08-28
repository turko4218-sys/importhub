import { chromium, type Browser, type BrowserContext } from "playwright";
import { config } from "../config.js";

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export async function humanDelay(): Promise<void> {
  await randomDelay(config.scraper.minDelayMs, config.scraper.maxDelayMs);
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    proxy: config.scraper.proxyUrl ? { server: config.scraper.proxyUrl } : undefined,
  });
}

export async function newContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    userAgent: config.scraper.userAgent,
    viewport: { width: 1366, height: 900 },
    locale: "es-ES",
  });
}
