/**
 * Read-side helpers for the Movers board (PHASE 3). Mirrors the fs/read
 * pattern in lib/performance.ts: the committed JSON in data/movers/ is the
 * source the server-rendered /movers page reads — never D1 at request time.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { MoversFile } from "./movers-board";

const MOVERS_DIR = path.resolve(process.cwd(), "data", "movers");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Dated movers files, ascending. Excludes latest.json. */
export function listMoversDates(): string[] {
  if (!fs.existsSync(MOVERS_DIR)) return [];
  return fs
    .readdirSync(MOVERS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

function read(file: string): MoversFile | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as MoversFile;
  } catch {
    return null;
  }
}

/** Load a specific date's movers file. Returns null for a bad/absent date. */
export function loadMovers(date: string): MoversFile | null {
  if (!DATE_RE.test(date)) return null;
  return read(path.join(MOVERS_DIR, `${date}.json`));
}

/** Load latest.json, falling back to the newest dated file if it's missing. */
export function loadLatestMovers(): MoversFile | null {
  const latest = read(path.join(MOVERS_DIR, "latest.json"));
  if (latest) return latest;
  const dates = listMoversDates();
  return dates.length ? loadMovers(dates[dates.length - 1]) : null;
}
