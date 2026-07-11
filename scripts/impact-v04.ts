/**
 * v0.4 impact analysis (bank metric applicability). READ-ONLY, no keys, no D1,
 * no FMP: reads the latest committed snapshot and reports the structural impact
 * of dropping EV/EBITDA + FCF (composite) and Altman-Z/net-debt-EBITDA/interest-
 * coverage (quality) for banks.
 *
 * IMPORTANT LIMITATION: committed snapshots store only CATEGORY-level scores
 * (no per-metric breakdown) and no `industry` field, so exact new composites
 * cannot be recomputed offline — that needs a keyed CI dry-run (FMP). This
 * reports the affected set + direction so the transition can be sized.
 *
 * Run: npm run impact-v04
 */
import * as fs from "node:fs";
import * as path from "node:path";

const dir = path.resolve(process.cwd(), "data", "snapshots");
const file = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().pop()!;
const snap = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as {
  picks: Array<{ ticker: string; companyName: string; sector?: string; composite: number; signal: string; confidence: string }>;
};

// Bank-name heuristic (snapshots lack `industry`, so we approximate the bank
// subset by name — the real gate in the model is industry =~ /\bbank/).
const BANK_NAME = /\b(bank|bancorp|banc\b|bancshares|banco|financ(ial|iere)\s+corp)/i;

const fin = snap.picks.filter((p) => p.sector === "Financial Services");
const likelyBanks = fin.filter((p) => BANK_NAME.test(p.companyName));

const bySignal = (rows: typeof likelyBanks) =>
  rows.reduce<Record<string, number>>((a, p) => ((a[p.signal] = (a[p.signal] ?? 0) + 1), a), {});

console.log(`Snapshot: ${file}`);
console.log(`Financial Services names: ${fin.length}`);
console.log(`Likely banks (name heuristic; real gate is industry =~ /bank/): ${likelyBanks.length}`);
console.log(`Likely-bank signal mix (v0.3): ${Object.entries(bySignal(likelyBanks)).map(([k, v]) => `${k}=${v}`).join(" ")}`);
console.log(`Likely-bank composite range (v0.3): ${Math.min(...likelyBanks.map((p) => p.composite))}–${Math.max(...likelyBanks.map((p) => p.composite))}, mean ${(likelyBanks.reduce((s, p) => s + p.composite, 0) / likelyBanks.length).toFixed(1)}`);
console.log(`\nTickers (likely banks): ${likelyBanks.map((p) => p.ticker).sort().join(", ")}`);
console.log(
  `\nv0.4 direction: EV/EBITDA, FCF Yield, FCF Growth are typically LOW/degenerate for banks; ` +
    `dropping them RAISES the value/growth/profitability category scores and removes the ` +
    `completeness penalty → bank composites shift modestly UP, confidence improves. Some HOLD→BUY ` +
    `flips are possible near thresholds. Exact per-ticker deltas require a keyed CI dry-run.`
);
