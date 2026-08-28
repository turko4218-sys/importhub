import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";
import type { JobKind, JobRecord, JobStatus } from "../types.js";

mkdirSync(dirname(config.dbPath), { recursive: true });
const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'product',
    status TEXT NOT NULL,
    error TEXT,
    product TEXT,
    listing TEXT,
    child_job_ids TEXT,
    mercadolibre TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

interface JobRow {
  id: string;
  url: string;
  kind: JobKind;
  status: JobStatus;
  error: string | null;
  product: string | null;
  listing: string | null;
  child_job_ids: string | null;
  mercadolibre: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: JobRow): JobRecord {
  return {
    id: row.id,
    url: row.url,
    kind: row.kind,
    status: row.status,
    error: row.error,
    product: row.product ? JSON.parse(row.product) : null,
    listing: row.listing ? JSON.parse(row.listing) : null,
    childJobIds: row.child_job_ids ? JSON.parse(row.child_job_ids) : null,
    mercadolibre: row.mercadolibre ? JSON.parse(row.mercadolibre) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createJob(id: string, url: string, kind: JobKind = "product"): JobRecord {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO jobs (id, url, kind, status, error, product, listing, child_job_ids, mercadolibre, created_at, updated_at)
     VALUES (?, ?, ?, 'queued', NULL, NULL, NULL, NULL, NULL, ?, ?)`
  ).run(id, url, kind, now, now);
  return getJob(id)!;
}

export function updateJob(id: string, patch: Partial<Omit<JobRecord, "id" | "createdAt">>): JobRecord | null {
  const existing = getJob(id);
  if (!existing) return null;

  const merged: JobRecord = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  db.prepare(
    `UPDATE jobs SET status = ?, error = ?, product = ?, listing = ?, child_job_ids = ?, mercadolibre = ?, updated_at = ? WHERE id = ?`
  ).run(
    merged.status,
    merged.error,
    merged.product ? JSON.stringify(merged.product) : null,
    merged.listing ? JSON.stringify(merged.listing) : null,
    merged.childJobIds ? JSON.stringify(merged.childJobIds) : null,
    merged.mercadolibre ? JSON.stringify(merged.mercadolibre) : null,
    merged.updatedAt,
    id
  );

  return merged;
}

export function getJob(id: string): JobRecord | null {
  const row = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as JobRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function listJobs(limit = 50): JobRecord[] {
  const rows = db.prepare(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?`).all(limit) as JobRow[];
  return rows.map(rowToRecord);
}
