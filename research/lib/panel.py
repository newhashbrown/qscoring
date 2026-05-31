"""
Panel loading + the validation firewall.

A "factor panel" is a wide table (one row per date x ticker) of QScore factor
scores, paired with a sidecar `<panel>.meta.json` describing its PROVENANCE:

  - "forward"             : flattened from data/snapshots/*.json. Point-in-time
                            clean (each score was computed live that day). This
                            is the ONLY panel whose IC may be published or used
                            for the in-sample/out-of-sample / billing-gate story.
  - "backward_diagnostic" : scores re-derived from truncated FMP price history.
                            Useful to exercise the harness and A/B factor
                            changes, but carries survivorship + stale-
                            normalization bias (and, for fundamentals,
                            restatement). NEVER validation.

The firewall: `require_publishable()` raises unless provenance == "forward".
`banner()` stamps every diagnostic output with a loud, unmissable header and the
bias tags so a diagnostic number can never quietly look like a validated one.
If you find yourself wanting to bypass this, don't — it's the whole point.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

FORWARD = "forward"
BACKWARD_DIAGNOSTIC = "backward_diagnostic"


@dataclass
class PanelMeta:
    provenance: str
    factors_valid: list[str]
    bias: list[str] = field(default_factory=list)
    generated_at: str = ""
    source: str = ""
    universe_size: int = 0
    notes: str = ""

    @property
    def is_publishable(self) -> bool:
        return self.provenance == FORWARD


class NotPublishableError(RuntimeError):
    """Raised when a non-forward panel is fed to a publishable code path."""


def load_panel(panel_path: str | Path) -> tuple[pd.DataFrame, PanelMeta]:
    """Load a factor panel parquet/csv plus its sidecar meta.

    The DataFrame is indexed by (date, ticker) so it drops straight into
    AlphaLens. Raises if the meta sidecar is missing — an unlabeled panel is
    treated as untrusted by construction.
    """
    panel_path = Path(panel_path)
    meta_path = panel_path.with_suffix(panel_path.suffix + ".meta.json")
    if not meta_path.exists():
        # Allow `<name>.meta.json` next to `<name>.parquet` too.
        meta_path = panel_path.parent / (panel_path.stem + ".meta.json")
    if not meta_path.exists():
        raise NotPublishableError(
            f"No meta sidecar for {panel_path}. Unlabeled panels are untrusted; "
            "re-export with scripts/research/export-factor-panel.ts."
        )

    raw_meta = json.loads(meta_path.read_text())
    meta = PanelMeta(
        provenance=raw_meta.get("provenance", ""),
        factors_valid=raw_meta.get("factors_valid", []),
        bias=raw_meta.get("bias", []),
        generated_at=raw_meta.get("generated_at", ""),
        source=raw_meta.get("source", ""),
        universe_size=raw_meta.get("universe_size", 0),
        notes=raw_meta.get("notes", ""),
    )

    if panel_path.suffix == ".parquet":
        df = pd.read_parquet(panel_path)
    else:
        df = pd.read_csv(panel_path)

    df["date"] = pd.to_datetime(df["date"], utc=True)
    df = df.set_index(["date", "ticker"]).sort_index()
    return df, meta


def require_publishable(meta: PanelMeta) -> None:
    """Firewall gate. Call this at the top of any code path that produces a
    number intended for the methodology page, the IS/OOS split, or the billing
    gate. A diagnostic panel hitting this is a hard stop, not a warning."""
    if not meta.is_publishable:
        raise NotPublishableError(
            f"Refusing to run a PUBLISHABLE analysis on a '{meta.provenance}' panel. "
            f"Only forward (snapshot) panels are publishable. bias={meta.bias}. "
            "Use this panel for diagnostics only."
        )


def banner(meta: PanelMeta) -> str:
    """A loud header stamped on every diagnostic output."""
    if meta.is_publishable:
        return (
            "================ FORWARD PANEL (publishable) ================\n"
            f"source={meta.source}  generated={meta.generated_at}  universe={meta.universe_size}\n"
            "============================================================="
        )
    return (
        "\n"
        "############################################################\n"
        "#  DIAGNOSTIC — NOT VALIDATION                              #\n"
        "#  Re-derived from truncated history. Do NOT publish, cite  #\n"
        "#  on the methodology page, or use for the billing gate.    #\n"
        f"#  bias = {', '.join(meta.bias) or 'none-declared':<46}#\n"
        f"#  valid factors = {', '.join(meta.factors_valid) or 'none':<37}#\n"
        "############################################################"
    )
