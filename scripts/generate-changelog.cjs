/**
 * Generates QScoring-Changelog.docx — a timeline summary of work
 * completed on qscoring.com from May 7-9, 2026. One-shot script.
 */
const fs = require("node:fs");
const path = require("node:path");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageOrientation,
  LevelFormat,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  BorderStyle,
  PageBreak,
} = require("docx");

const ARIAL = "Arial";
const MONO = "Consolas";

// ───────────── helpers ─────────────

function title(text) {
  return new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 120 },
    children: [new TextRun({ text, bold: true, size: 48, font: ARIAL })],
  });
}

function subtitle(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 480 },
    children: [new TextRun({ text, size: 24, color: "666666", font: ARIAL })],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 180 },
    children: [new TextRun({ text, bold: true, size: 32, font: ARIAL })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 140 },
    children: [new TextRun({ text, bold: true, size: 26, font: ARIAL })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, bold: true, size: 22, font: ARIAL })],
  });
}

function p(text, opts = {}) {
  const runs = Array.isArray(text)
    ? text
    : [new TextRun({ text, size: 22, font: ARIAL, ...opts })];
  return new Paragraph({
    spacing: { before: 60, after: 120, line: 320 },
    children: runs,
  });
}

function bullet(text, opts = {}) {
  const runs = Array.isArray(text)
    ? text
    : [new TextRun({ text, size: 22, font: ARIAL, ...opts })];
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 30, after: 30, line: 300 },
    children: runs,
  });
}

function code(text) {
  return new TextRun({ text, size: 20, font: MONO, color: "0E5550" });
}

function callout(text) {
  return new Paragraph({
    spacing: { before: 180, after: 180 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 18, color: "00D4AA", space: 12 },
    },
    indent: { left: 240 },
    children: [
      new TextRun({ text, size: 22, italics: true, font: ARIAL, color: "444444" }),
    ],
  });
}

// table helper for the production-state matrix
function infoTable(rows) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [3200, 6160],
    rows: rows.map(
      ([k, v]) =>
        new TableRow({
          children: [
            new TableCell({
              borders,
              width: { size: 3200, type: WidthType.DXA },
              shading: { fill: "F4F6F8", type: ShadingType.CLEAR },
              margins: { top: 100, bottom: 100, left: 140, right: 140 },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: k, bold: true, size: 20, font: ARIAL })],
                }),
              ],
            }),
            new TableCell({
              borders,
              width: { size: 6160, type: WidthType.DXA },
              margins: { top: 100, bottom: 100, left: 140, right: 140 },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: v, size: 20, font: ARIAL })],
                }),
              ],
            }),
          ],
        })
    ),
  });
}

// ───────────── content ─────────────

const children = [];

// Cover
children.push(title("QScoring.com Build Changelog"));
children.push(subtitle("Project work timeline · May 7 – May 9, 2026"));
children.push(
  p(
    "This document is a chronological summary of feature work completed on qscoring.com over the past three calendar days. Each section corresponds to a thematic work stream within a day; bullets describe what shipped and the commit hash where applicable. A production-state summary closes the document."
  )
);

// ─── Executive overview ───
children.push(h1("Executive overview"));
children.push(
  p(
    "Three days of focused product, infrastructure, content, and SEO work. The site started the period as a single-ticker scoring tool with a methodology page; it ends the period as a multi-surface product with portfolio analysis, side-by-side comparison, watchlist alerts, a four-cluster blog, factor-driven category pages, live forward-return tracking, dynamic Open Graph images, and an automated daily refresh pipeline."
  )
);
children.push(p("Headline numbers across the three days:"));
children.push(bullet("≈ 30 commits to origin/main"));
children.push(bullet("9 published blog posts across 4 thematic clusters"));
children.push(bullet("15 curated head-to-head comparison pages"));
children.push(bullet("5 factor- and signal-driven category pages"));
children.push(bullet("15 glossary terms with full DefinedTerm JSON-LD"));
children.push(bullet("6 child sitemaps under a sitemap-index"));
children.push(bullet("2 GitHub Actions running on cron schedules"));
children.push(bullet("4 Cloudflare secrets in production"));
children.push(bullet("2 D1 tables tracking subscribers and watchlist entries"));

// ─── Day 1 ───
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1("Day 1 — May 7, 2026"));
children.push(p("Foundation: glossary system + score-page cross-links."));

children.push(h2("1. Glossary system"));
children.push(p("The audit identified educational content as the single biggest content gap. Each glossary term gets its own URL for SEO, with cross-links from every score page that references the relevant factor."));
children.push(bullet("New data file data/glossary.ts with 15 terms (10 QScore-specific, 5 general quant)"));
children.push(bullet("/glossary index page grouped by category, DefinedTermSet JSON-LD"));
children.push(bullet("/glossary/[slug] detail pages SSG-rendered, DefinedTerm JSON-LD per term"));
children.push(bullet("Inline-link parser: paragraphs support [text](/url) markdown-style cross-links into other glossary terms or methodology anchors"));
children.push(bullet("Optional formula display block (used on z-score, RSI, beta, P/E, Sharpe pages)"));
children.push(bullet("Sitemap entries added for all 16 URLs (index + 15 terms)"));
children.push(bullet("Footer link to /glossary added to homepage and methodology"));
children.push(callout("Commit: feat: add glossary with 15 terms and DefinedTerm schema"));

children.push(h2("2. Score-page cross-linking"));
children.push(p("Every /score/[ticker] page now links its category headings (Value / Growth / Momentum / Profitability / Risk) into the corresponding glossary term. Same treatment for the QScore Signal label and Confidence label. Builds internal authority into the new glossary pages."));
children.push(bullet("Each factor card heading on /score/[ticker] becomes a glossary link"));
children.push(bullet("Composite-panel labels (Signal, Confidence) also link into glossary"));
children.push(bullet("Subtle dotted-underline styling (.glossary-info-link) so headings still read as headings until hovered"));
children.push(callout("Commit: feat: cross-link score view category labels into glossary"));

// ─── Day 2 ───
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1("Day 2 — May 8, 2026"));
children.push(p("The big build day — caching fixes, homepage carousel saga, email notifications, SEO infrastructure, score quality fixes, four major new product surfaces, and the blog launch."));

children.push(h2("1. FMP rate-limit diagnosis + tiered TTL fix"));
children.push(bullet("Diagnosed 17% over-limit from spikes through the FMP dashboard"));
children.push(bullet("Tiered cache TTLs in lib/scoring/fmp.ts: quote 15m, price history 6h, fundamentals 24h, profile 24h"));
children.push(bullet("Updated methodology page to honestly document the new tiered cadence"));
children.push(callout("Commit: perf: tier FMP cache TTLs by data freshness to stay under rate limit"));

children.push(h2("2. Homepage strong-picks carousel (failed → reverted → re-architected)"));
children.push(bullet("First attempt: scored 66 tickers at SSR — caused Cloudflare error 1102 (worker exceeded CPU time limit)"));
children.push(bullet("Reverted within minutes after live probe showed homepage timeouts and /score/AAPL 503s"));
children.push(bullet("Re-architected: scripts/build-strong-picks.ts hits the live /api/score endpoint with 2s pacing + retry on 429/503, writes data/strong-picks.json offline"));
children.push(bullet("Homepage carousel now reads the prebuilt JSON statically — zero CPU at SSR"));
children.push(bullet("Carousel cycle dropped from 7s to 4.5s with all picks pre-loaded"));
children.push(bullet("npm run strong-picks added; daily GitHub Action workflow at .github/workflows/refresh-strong-picks.yml runs at 09:30 UTC"));
children.push(bullet('Daily caption added: "Quant snapshot from May 8, 2026 market close · refreshed daily"'));
children.push(callout("Commits: feat: cycle homepage carousel through prebuilt top-12 picks; ci: daily GitHub Action to refresh data/strong-picks.json"));

children.push(h2("3. Admin notification email + secret-management debug"));
children.push(bullet("New lib/email/admin-notify.ts template, fired alongside the existing welcome email when a new subscriber inserts"));
children.push(bullet("Long debug session: ADMIN_EMAIL declared in wrangler.jsonc vars block didn't propagate to cf.env at runtime"));
children.push(bullet("Resolution: set as wrangler secret instead of plaintext var; same path as RESEND_API_KEY"));
children.push(bullet("All admin notifications now reach gagansingh@njnyit.com on every successful new signup"));
children.push(bullet("Welcome + admin emails fired in one ctx.waitUntil block so neither blocks the user-facing 200"));
children.push(callout("Commits: feat: send admin notification email on every new waitlist signup; fix: move ADMIN_EMAIL from wrangler.jsonc vars to secret"));

children.push(h2("4. Strategic discussion: deferred upgrade timing (FMP, Cloudflare)"));
children.push(p("Concluded both upgrades should be event-driven, not calendar-driven. FMP Premium upgrade tied to backtest project (needs historical fundamentals); Cloudflare Pro tied to paid customer launch."));

children.push(h2("5. SEO infrastructure"));

children.push(h3("Sitemap split"));
children.push(bullet("Replaced single /sitemap.xml with a sitemap-index pointing at child sitemaps"));
children.push(bullet("Children: /sitemap-static, /sitemap-categories, /sitemap-compare, /sitemap-glossary, /sitemap-scores-core, /sitemap-scores-longtail, /sitemap-blog (added later in the day)"));
children.push(bullet("Per-child indexation tracking now possible in Google Search Console"));
children.push(callout("Commit: seo: split sitemap into category-specific child sitemaps"));

children.push(h3("Ticker hygiene (noindex thin pages)"));
children.push(bullet("Sitemap filters preferred-share series like CTA-PA, EFC-PC, OAK-PA/PB (regex /-P[A-Z]$/)"));
children.push(bullet("Runtime noindex on /score/[ticker] when result.confidence === 'LOW' OR scoreTicker throws"));
children.push(bullet("Common-share class names like BRK-A and BRK-B explicitly preserved"));
children.push(callout("Commit: seo: gate thin ticker pages from indexing (sitemap + runtime)"));

children.push(h3("robots.txt cleanup"));
children.push(bullet("Removed redundant Allow: list (only /api/ disallow has any effect)"));
children.push(bullet("File now reads: User-Agent / Disallow / Host / Sitemap"));
children.push(callout("Commit: chore: drop stale Allow rules from robots.txt"));

children.push(h2("6. Score quality fixes (audit findings)"));
children.push(bullet("Signal rounding: deriveSignal now Math.round()s before threshold checks so AAPL with raw short-term 59.6 (displayed 60) correctly shows Buy Short-Term instead of Hold"));
children.push(bullet("Commentary fallback: lib/commentary/fallback.ts produces deterministic ticker-specific prose when AI generation fails. No more empty 'QScore Analysis' sections."));
children.push(bullet("Movers cache window aligned with detail page (3600s → 900s) so TSLA can't show different composites on homepage vs /score/TSLA"));
children.push(bullet("Generated-at timestamp now visible on QScore Movers section so any future drift is user-detectable"));
children.push(callout("Commits: fix: signal rounding + deterministic commentary fallback; fix: align homepage movers cache window; feat: surface generated-at timestamp on homepage QScore Movers"));

children.push(h2("7. Sentiment removal from homepage copy"));
children.push(bullet('Hero subtitle and "How it works" step 2 both claimed sentiment was a factor; methodology has never documented one'));
children.push(bullet("Replaced with the actual five factors (value, growth, momentum, profitability, risk) — credibility alignment"));
children.push(callout("Commit: fix: align homepage copy with documented methodology factors"));

children.push(h2("8. Category landing pages"));
children.push(bullet("New /scores index + /scores/[category] detail pages, SSG'd via generateStaticParams"));
children.push(bullet("Five categories: ai-stocks, large-cap-tech, buy-short-term, high-momentum-stocks, high-growth-low-value"));
children.push(bullet("Reads from data/scoreboard.json (now produced by the daily picks script alongside strong-picks.json)"));
children.push(bullet("ItemList JSON-LD per category page; CollectionPage JSON-LD on the index"));
children.push(bullet("ScoreboardCard component renders a compact 5-factor mini-grid per ticker"));
children.push(callout("Commit: feat: category landing pages at /scores/[slug] for stock discovery"));

children.push(h2("9. Side-by-side comparison pages"));
children.push(bullet("/compare index + /compare/[pair] detail pages"));
children.push(bullet('15 curated high-search-intent pairs SSG\'d (NVDA-vs-AMD, AAPL-vs-MSFT, GOOGL-vs-META, AMZN-vs-WMT, JPM-vs-BAC, V-vs-MA, KO-vs-PEP, MCD-vs-SBUX, HD-vs-COST, ORCL-vs-CRM, ADBE-vs-CRM, DIS-vs-NFLX, AMD-vs-AVGO, AAPL-vs-GOOGL, TSLA-vs-AAPL)'));
children.push(bullet("Long-tail pairs render dynamically via ISR with live scoreTicker fallback"));
children.push(bullet('Verdict box uses deterministic "key reason" prose picking the largest factor gap'));
children.push(bullet("8-row comparison table; per-row winner highlighting; both ticker pages linked from CTA buttons"));
children.push(callout("Commit: feat: side-by-side ticker comparison pages at /compare/[pair]"));

children.push(h2("10. Live performance / forward-return tracking"));
children.push(bullet("scripts/build-strong-picks.ts now also writes data/snapshots/YYYY-MM-DD.json — append-only ledger"));
children.push(bullet("/performance page reads snapshot history, shows days-captured counter, total observations, horizon availability"));
children.push(bullet("Snapshot files committed to public source control — no look-ahead bias possible by construction"));
children.push(bullet("Methodology validation pledge now points at /performance as the live counterpart to the future-tense backtest commitment"));
children.push(callout("Commit: feat: live forward-return tracking — daily snapshots + /performance page"));

children.push(h2("11. Watchlist v1 (signup, confirmation, unsubscribe)"));
children.push(bullet("D1 migration: new watchlist_entries table with last_signal / last_composite / unsubscribe_token columns"));
children.push(bullet("WatchButton client component on every /score/[ticker] page"));
children.push(bullet("POST /api/watch creates the entry, fires confirmation email + admin notify, returns 200 fire-and-forget"));
children.push(bullet("GET /api/watch/unsubscribe with per-row token — one-click unsubscribe in every email per CAN-SPAM"));
children.push(bullet("Re-watching the same ticker silently no-ops (INSERT OR IGNORE)"));
children.push(callout("Commit: feat: ticker watchlist with email confirmation + one-click unsubscribe"));

children.push(h2("12. Date logic fix (UTC → US market close in ET)"));
children.push(bullet("Picks build runs at 09:30 UTC = 5:30am ET, past midnight UTC for ET readers — every page that displayed generatedAt.split('T')[0] showed 'May 9' for May 8 data"));
children.push(bullet("New lib/market-date.ts: marketCloseDate(iso) maps timestamp → US trading-day date in ET, with weekend rollback"));
children.push(bullet("Applied across DemoCarousel, /scores, /scores/[category], /compare, /compare/[pair], /performance"));
children.push(bullet("Snapshot file naming switched from UTC date to market close date for consistency"));
children.push(callout("Commit: fix: derive snapshot date from US market close in ET, not raw UTC"));

children.push(h2("13. Blog cluster restructure + 9 posts"));
children.push(bullet("Posts now organized into 4 clusters: qscore-methodology, factor-investing, stock-comparisons, stock-metrics, market-signals"));
children.push(bullet("Each cluster has its own /blog/[cluster] index page; master /blog index groups posts by cluster"));
children.push(bullet("BlogPosting JSON-LD on each post; CollectionPage on cluster pages; Blog with hasPart on master index"));

children.push(h3("9 posts written across the day"));
children.push(bullet("/blog/how-to-read-a-qscore — 5-factor walkthrough"));
children.push(bullet("/blog/what-is-the-qscore — newcomer intro"));
children.push(bullet("/blog/nvda-vs-amd — stock comparison"));
children.push(bullet("/blog/aapl-vs-msft — stock comparison"));
children.push(bullet("/blog/googl-vs-meta — stock comparison"));
children.push(bullet("/blog/pe-ratio-explained — value-factor anchor"));
children.push(bullet("/blog/rsi-explained — momentum-factor anchor"));
children.push(bullet("/blog/beta-explained — risk-factor anchor"));
children.push(bullet("/blog/sharpe-ratio-explained — validation-pledge anchor"));
children.push(bullet("Each post follows a search-intent template: H1, 2-sentence intro, 'how to read it', formula (where applicable), real ticker examples, common mistakes, related reads"));
children.push(callout("Commits: feat: SEO blog at /blog with two evergreen seed posts; feat: blog cluster restructure + 3 stock-comparison posts; feat: 4 metric-explainer posts in the stock-metrics cluster"));

children.push(h2("14. Universe expansion to mid-cap + nightly cron"));
children.push(bullet("MIN_MARKET_CAP dropped from $15B to $2B — universe now includes the entire S&P 500 + S&P MidCap 400"));
children.push(bullet("MAX_UNIVERSE_SIZE bumped to 800; pacing tightened to 2.5s per ticker"));
children.push(bullet("New .github/workflows/refresh-universe-stats.yml runs at 02:00 UTC daily"));
children.push(bullet("Sector mean/std denominators now ~100 names per sector instead of ~30"));
children.push(callout("Commit: feat: nightly universe-stats refresh + expand universe to mid-cap"));

children.push(h2("15. Per-ticker dynamic Open Graph images"));
children.push(bullet("New app/score/[ticker]/opengraph-image.tsx — Next.js auto-wires it into og:image and twitter:image"));
children.push(bullet("1200x630 PNG generated by next/og's ImageResponse (Satori): ticker, composite, signal pill, factor row"));
children.push(bullet("Color-coded by signal tone; falls back to a generic branded card if scoreTicker fails"));
children.push(callout("Commit: feat: dynamic Open Graph image per ticker for social sharing"));

children.push(h2("16. Score-page 'so what?' upgrade"));
children.push(bullet("New insight panel between composite ring and price chart"));
children.push(bullet("Top positive driver + top negative driver as colored callouts linking into glossary"));
children.push(bullet("Confidence reason: structured one-sentence explanation of why HIGH/MEDIUM/LOW (data completeness + composite decisiveness + weakest-category coverage)"));
children.push(bullet("Model version + generated timestamp visible per page"));
children.push(bullet("Related-links row added after the factor grid for cross-paths to /compare, /scores, /methodology, /glossary"));
children.push(bullet("New constant QSCORE_MODEL_VERSION = 'v0.3' with versioning policy + changelog documented in lib/scoring/model-version.ts"));
children.push(callout("Commit: feat: score-page 'so what?' upgrade — drivers + confidence reason + model version"));

children.push(h2("17. Portfolio analyzer (/portfolio)"));
children.push(bullet("Stateless analyzer accepting paste of up to 30 holdings"));
children.push(bullet("Four input modes: Equal weight / Weights / Shares / Dollar values"));
children.push(bullet("Brokerage-paste support: column-aware parser handles tab-separated rows from Robinhood, Fidelity, Schwab"));
children.push(bullet("Shares mode picks the first integer column (typical Qty); Values mode picks the largest positive number (typical Value$)"));
children.push(bullet("Denylist of brokerage UI words (TRADE, ACTIONS, TOTAL, CASH, TRANSFER, etc.) silently filtered"));
children.push(bullet("Output: aggregate composite, factor exposure radar, signal mix, sector concentration, strongest/weakest 3"));
children.push(bullet("Per-position table 'What the model says about each holding' added in a follow-up commit"));
children.push(bullet("Heavy disclaimer reinforcing structured factor analysis vs personalized advice"));
children.push(callout("Commits: feat: portfolio analyzer at /portfolio; feat: portfolio analyzer accepts broker-paste with shares/values modes; fix: portfolio parser ignores brokerage UI text; feat: per-position signal table"));

// ─── Day 3 ───
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1("Day 3 — May 9, 2026"));
children.push(p("Watchlist alert delivery, navigation overhaul, brand identity."));

children.push(h2("1. Watchlist alert delivery cron"));
children.push(bullet("New /api/cron/watchlist-alerts endpoint, Bearer-token authenticated"));
children.push(bullet("Reads watchlist_entries from D1, diffs each row vs the fresh scoreboard, groups changes by recipient"));
children.push(bullet("ONE digest email per user per day with all flips bundled (avoids per-flip spam during regime changes)"));
children.push(bullet("First-time entries set baseline silently — no alert until a real flip occurs"));
children.push(bullet("Composite-only changes (signal stayed) refresh stored composite without alerting"));
children.push(bullet("Long-tail tickers outside scoreboard skipped silently (counted in response summary)"));
children.push(bullet("Updated daily refresh-strong-picks workflow: sleep 240s after push for CF deploy, then curl the alert endpoint"));
children.push(bullet("Workflow also now correctly commits scoreboard.json + snapshots/*.json (was previously only committing strong-picks.json — silent latent bug)"));
children.push(bullet("New WATCHLIST_CRON_TOKEN secret in both Cloudflare and GitHub"));
children.push(callout("Commit: feat: watchlist alert delivery — daily digest of signal flips"));

children.push(h2("2. Universal site navigation"));
children.push(bullet("ScoreNav upgraded into a universal nav used on every page including the homepage"));
children.push(bullet("Six primary destinations in the header: Score, Portfolio, Compare, Performance, Blog, Methodology"));
children.push(bullet("Mobile (< 980px): collapses to a hamburger toggle; logo + CTA stay visible"));
children.push(bullet("Closes on Escape, link click, and logo click"));
children.push(bullet("Homepage now uses ScoreNav with showSearch={false} (hero already has the search form)"));
children.push(callout("Commit: feat: universal site nav with primary destinations + mobile hamburger"));

children.push(h2("3. Logo iterations (V1 → V2 → V3)"));
children.push(bullet("V1: 1MB PNG didn't deploy to CF — diagnosed as OpenNext bundler silently dropping large PNGs"));
children.push(bullet("Workaround: sharp-resampled to 8KB nav variant + 105KB favicon variant"));
children.push(bullet('V1 trim revealed dark canvas baked in; auto-trimmed via sharp.trim() and bumped display to 56px'));
children.push(bullet("V2: transparent-background PNG, 67KB nav variant, 60px display"));
children.push(bullet("V3: squarer aspect (2.1:1 vs V2's 2.6:1), 44KB nav variant, hexagon symbol reads stronger at small sizes"));
children.push(bullet("app/icon.png updated alongside each iteration so favicon and nav stay in sync"));
children.push(callout("Commits: feat: dynamic Open Graph image per ticker; feat: switch nav logo to the new image mark; fix: downsize logo PNG; fix: trim the dark canvas padding; fix: swap to transparent-background logo; chore: swap to logo V3"));

children.push(h2("4. Strategic discussion"));
children.push(bullet("Sophisticated-investor framework discussion: the 'mispriced expectations' mental model is right for discretionary value/contrarian investing; doesn't fit pure quants, trend followers, or index investors"));
children.push(bullet("Identified gap between the QScore framework (factor-only) and the full sophisticated-investor toolkit (also wants catalyst, management, expectations, industry position)"));
children.push(bullet("Future positioning angle: be honest that QScore is the quantitative half; qualitative half still requires the user"));

// ─── Production state ───
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1("Production state — end of May 9, 2026"));

children.push(h2("Live URL surface"));
children.push(
  infoTable([
    ["/", "Homepage with strong-picks carousel + top movers"],
    ["/score", "Ticker search landing page"],
    ["/score/[ticker]", "Per-ticker QScore detail (insight panel + factor breakdown + watch button + commentary)"],
    ["/scores", "Categories index"],
    ["/scores/[category]", "5 category pages (ai-stocks, large-cap-tech, buy-short-term, high-momentum-stocks, high-growth-low-value)"],
    ["/compare", "Comparison hub"],
    ["/compare/[pair]", "15 curated SSG pairs + dynamic ISR for any pair"],
    ["/performance", "Live forward-return tracking, snapshot counter, horizon availability"],
    ["/portfolio", "Stateless portfolio analyzer with 4 input modes"],
    ["/blog", "Master index grouped by 4 clusters"],
    ["/blog/[cluster]", "qscore-methodology, factor-investing, stock-comparisons, stock-metrics"],
    ["/blog/[slug]", "9 published posts"],
    ["/methodology", "Full QScore methodology + validation pledge + model v0.3"],
    ["/glossary", "15 terms across QScore + general quant"],
    ["/glossary/[slug]", "15 detail pages with DefinedTerm JSON-LD"],
  ])
);

children.push(h2("Backend infrastructure"));
children.push(
  infoTable([
    ["Cloudflare Workers", "OpenNext-built worker serving every route, AI binding for commentary, D1 binding for subscribers + watchlist"],
    ["D1 tables", "subscribers (waitlist signups), watchlist_entries (per-ticker watches with last_signal tracking)"],
    ["Cloudflare secrets", "FMP_API_KEY, RESEND_API_KEY, ADMIN_EMAIL, WATCHLIST_CRON_TOKEN"],
    ["Email provider", "Resend, sending from noreply@qscoring.com"],
  ])
);

children.push(h2("Automated jobs (GitHub Actions)"));
children.push(
  infoTable([
    [".github/workflows/refresh-strong-picks.yml", "Daily 09:30 UTC — rebuilds strong-picks.json + scoreboard.json + snapshots/YYYY-MM-DD.json, commits if changed, then triggers watchlist alert cron after 240s deploy buffer"],
    [".github/workflows/refresh-universe-stats.yml", "Nightly 02:00 UTC — rebuilds data/universe-stats.json with sector mean/std for the ~800-ticker mid+large-cap universe, commits if changed"],
  ])
);

children.push(h2("Sitemap structure"));
children.push(bullet("/sitemap.xml — sitemap-index pointing at six children"));
children.push(bullet("/sitemap-static.xml — homepage, /score, /methodology, /glossary, /performance, /portfolio"));
children.push(bullet("/sitemap-blog.xml — index + 4 cluster pages + 9 posts"));
children.push(bullet("/sitemap-categories.xml — index + 5 category pages"));
children.push(bullet("/sitemap-compare.xml — index + 15 curated pair pages"));
children.push(bullet("/sitemap-glossary.xml — index + 15 term pages"));
children.push(bullet("/sitemap-scores-core.xml — ~199 popular tickers"));
children.push(bullet("/sitemap-scores-longtail.xml — ~2,027 long-tail tickers"));

children.push(h2("Outstanding items (deferred or for next session)"));
children.push(bullet("Score history chart per ticker — needs ~30 days of snapshot data accumulation to be useful"));
children.push(bullet("'Why did this change?' explanations on watchlist alerts — needs richer diff logic against multi-day snapshots"));
children.push(bullet('Email alert preview UI on the watchlist signup flow'));
children.push(bullet("Glossary expansion (~26 more terms across the user's proposed clusters)"));
children.push(bullet("Factor-investing blog cluster (still 0 posts, placeholder rendering 'first ones land soon')"));
children.push(bullet("Auto-generated ticker-specific monthly blog posts (carefully — Helpful Content penalty risk)"));
children.push(bullet("Portfolio analyzer 'email me a weekly digest' opt-in"));
children.push(bullet("Backtest pipeline (the validation pledge): point-in-time fundamentals + IC + quintile-spread Sharpe"));

children.push(p(""));
children.push(callout("End of changelog — generated " + new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })));

// ─── document ─────────────

const doc = new Document({
  styles: {
    default: { document: { run: { font: ARIAL, size: 22 } } },
    paragraphStyles: [
      {
        id: "Title",
        name: "Title",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 48, bold: true, font: ARIAL },
        paragraph: { spacing: { before: 0, after: 120 } },
      },
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 32, bold: true, font: ARIAL, color: "0E5550" },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 26, bold: true, font: ARIAL, color: "1A1A1A" },
        paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1 },
      },
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 22, bold: true, font: ARIAL, color: "444444" },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 }, // US Letter
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children,
    },
  ],
});

const outPath = path.resolve(process.cwd(), "QScoring-Changelog.docx");
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log(`Wrote ${outPath} (${buf.length.toLocaleString()} bytes)`);
});
