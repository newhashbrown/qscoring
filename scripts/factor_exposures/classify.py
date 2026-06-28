"""Style classification from factor betas.

Derives a short human-readable style label (e.g. "Defensive quality value")
from the regression betas, labeling ONLY dimensions whose t-stat clears the
significance gate. Thresholds are named constants so they're tunable.
"""

from __future__ import annotations

# Per-dimension significance gate: |t| must clear this for a dimension to be
# labeled at all (≈ two-sided 95%). Ignore the rest.
BETA_SIG_TSTAT: float = 1.96

# Market beta boundary: > this => high-beta, otherwise defensive (when the
# market loading itself is significant).
MARKET_HIGH_BETA: float = 1.0

# Label when no dimension clears significance.
UNCLASSIFIED: str = "Unclassified"

# (factor key, positive-loading token, negative-loading token), in the fixed
# order the phrase reads. Market is compared to MARKET_HIGH_BETA (not 0); the
# rest split on sign. The negative tokens for SMB ("large-cap") and MOM
# ("reversal") are the natural antonyms — the spec only names the positive side.
# NOTE: thresholds/tokens here are the single place to tune the taxonomy.
_DIMENSIONS: tuple[tuple[str, str, str], ...] = (
    ("Mkt-RF", "high-beta", "defensive"),
    ("SMB", "small-cap", "large-cap"),
    ("RMW", "quality", "junk"),
    ("HML", "value", "growth"),
    ("CMA", "conservative", "aggressive"),
    ("MOM", "momentum", "reversal"),
)


def style_label(betas: dict[str, float], tstats: dict[str, float]) -> str:
    """Compose a style label from significant beta dimensions, in a fixed,
    readable order. Returns UNCLASSIFIED if nothing is significant."""
    tokens: list[str] = []
    for key, positive, negative in _DIMENSIONS:
        beta = betas.get(key)
        tstat = tstats.get(key)
        if beta is None or tstat is None or abs(tstat) < BETA_SIG_TSTAT:
            continue  # only label dimensions that clear the significance gate
        if key == "Mkt-RF":
            tokens.append(positive if beta > MARKET_HIGH_BETA else negative)
        elif beta > 0:
            tokens.append(positive)
        elif beta < 0:
            tokens.append(negative)
        # a significant-but-exactly-zero beta contributes no tilt

    if not tokens:
        return UNCLASSIFIED
    label = " ".join(tokens)
    return label[0].upper() + label[1:]
