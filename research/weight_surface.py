"""
Plot the weight-sensitivity / stability surface for the QScore category weights.

Reads research/data/weight_sensitivity.csv (written by
scripts/research/weight-sensitivity.ts) and plots, per horizon, how the
rank-correlation of the perturbed composite vs the DEFAULT composite holds up as
each category weight is perturbed across a grid of deltas.

Overfit interpretation (the whole point of this chart):
  - A ROBUST model shows a broad, smooth plateau — rank-correlation vs default
    stays high (near 1.0) across weight perturbations. The ranking the QScore
    produces does not hinge on the exact weights.
  - A FRAGILE / OVER-TUNED model shows a sharp peak at delta=0 that collapses
    under small perturbations — the chosen weights sit on a knife-edge.

This is a STABILITY surface, not a forward-return IC surface: the input CSV
contains no forward returns, only rank-correlation of the perturbed ranking vs
the default ranking. It is labeled accordingly so it cannot be mistaken for a
validated IC result.

Firewall spirit: if the source panel was diagnostic (provenance !=
"forward"), the plot is stamped "DIAGNOSTIC — NOT VALIDATION".

Headless: matplotlib Agg backend. Saves research/data/weight_surface.png.

Run:
    python research/weight_surface.py
"""

from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # headless / no display

import matplotlib.pyplot as plt  # noqa: E402

DATA_DIR = Path(__file__).resolve().parent / "data"
CSV_PATH = DATA_DIR / "weight_sensitivity.csv"
PNG_PATH = DATA_DIR / "weight_surface.png"

CATEGORIES = ["value", "growth", "momentum", "profitability", "risk"]
HORIZONS = ["long", "short"]


def read_sensitivity(path: Path):
    """Read the sensitivity CSV. Returns (provenance, bias, records).

    The first line may be a `# provenance=... bias=... panel=...` comment that
    carries the source panel's firewall metadata; we parse it if present.
    """
    if not path.exists():
        raise FileNotFoundError(
            f"{path} not found. Generate it first:\n"
            "  npx tsx scripts/research/weight-sensitivity.ts "
            "--panel research/data/factor_panel_snapshots.csv"
        )

    provenance = "unknown"
    bias = ""
    lines = path.read_text(encoding="utf-8").splitlines()
    data_lines = lines
    if lines and lines[0].startswith("#"):
        meta = lines[0].lstrip("#").strip()
        for tok in meta.split():
            if tok.startswith("provenance="):
                provenance = tok.split("=", 1)[1]
            elif tok.startswith("bias="):
                bias = tok.split("=", 1)[1]
        data_lines = lines[1:]

    reader = csv.DictReader(data_lines)
    records = []
    for row in reader:
        try:
            records.append(
                {
                    "horizon": row["horizon"],
                    "category": row["category"],
                    "delta": float(row["delta"]),
                    "rank_corr": float(row["rank_corr_vs_default"]),
                    "mean_composite": float(row["mean_composite"]),
                }
            )
        except (KeyError, ValueError):
            # Skip malformed / non-finite rows rather than crashing the plot.
            continue
    return provenance, bias, records


def build_series(records):
    """series[horizon][category] -> (sorted_deltas, rank_corrs)."""
    grouped = defaultdict(lambda: defaultdict(dict))
    for r in records:
        grouped[r["horizon"]][r["category"]][r["delta"]] = r["rank_corr"]
    series = {}
    for horizon in HORIZONS:
        series[horizon] = {}
        for cat in CATEGORIES:
            pts = grouped.get(horizon, {}).get(cat, {})
            if not pts:
                continue
            deltas = sorted(pts.keys())
            series[horizon][cat] = (deltas, [pts[d] for d in deltas])
    return series


def plot(series, provenance: str, bias: str, out_path: Path) -> None:
    is_diagnostic = provenance != "forward"

    fig, axes = plt.subplots(1, len(HORIZONS), figsize=(13, 5.5), sharey=True)
    if len(HORIZONS) == 1:
        axes = [axes]

    for ax, horizon in zip(axes, HORIZONS):
        cat_series = series.get(horizon, {})
        for cat in CATEGORIES:
            if cat not in cat_series:
                continue
            deltas, corrs = cat_series[cat]
            ax.plot(deltas, corrs, marker="o", linewidth=1.6, label=cat)
        ax.axvline(0.0, color="0.6", linestyle="--", linewidth=1.0, zorder=0)
        ax.set_title(f"{horizon.capitalize()}-horizon weights")
        ax.set_xlabel("Per-category weight perturbation (delta)")
        ax.grid(True, alpha=0.3)
        ax.legend(fontsize=8, title="perturbed category")

    axes[0].set_ylabel("Rank-correlation of composite vs default weights")

    title = "QScore weight-sensitivity (stability surface)"
    subtitle = (
        "Robust = broad high-correlation plateau across perturbations; "
        "fragile/overfit = sharp peak at delta=0."
    )
    fig.suptitle(title, fontsize=14, fontweight="bold")
    fig.text(0.5, 0.93, subtitle, ha="center", fontsize=9, color="0.35")

    if is_diagnostic:
        fig.text(
            0.5,
            0.5,
            f"DIAGNOSTIC — NOT VALIDATION\nprovenance={provenance}"
            + (f"  bias={bias}" if bias and bias != "none" else ""),
            ha="center",
            va="center",
            fontsize=30,
            color="red",
            alpha=0.18,
            rotation=18,
            fontweight="bold",
        )

    fig.tight_layout(rect=(0, 0, 1, 0.91))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=130)
    plt.close(fig)


def main() -> None:
    provenance, bias, records = read_sensitivity(CSV_PATH)
    if not records:
        raise SystemExit(f"No usable rows in {CSV_PATH}.")
    series = build_series(records)
    plot(series, provenance, bias, PNG_PATH)
    label = "DIAGNOSTIC" if provenance != "forward" else "publishable"
    print(f"Wrote {PNG_PATH} ({label}; provenance={provenance}, {len(records)} rows)")


if __name__ == "__main__":
    main()
