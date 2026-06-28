"""Cleaned-universe loader + fund/share-class tripwire.

We read tickers from the committed, already-cleaned data/compare-universe.json
(produced by lib/scoring/universe.ts selectUniverse), NEVER from a raw FMP pull.
As defense-in-depth consistent with issues #62-63, assert_clean_universe re-checks
the same flag-independent signals the upstream filter uses, so the job fails loudly
if a share-class/fund artifact ever slips into the input.

The patterns below are ported verbatim from lib/scoring/universe.ts
(MUTUAL_FUND_TICKER + ETF_ISSUER_NAME) so the tripwire can't disagree with the
filter. The issuer list is deliberately NARROW (e.g. 'Invesco QQQ', not 'Invesco')
to avoid killing real operating companies (IVZ) or REITs ('Trust'/'Index' tokens).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

# Ported from lib/scoring/universe.ts.
_MUTUAL_FUND_TICKER = re.compile(r"^[A-Z]{4}X$")
_ETF_ISSUER_NAME = re.compile(
    r"\b(ProShares|Direxion|iShares|SPDR|VanEck|Global X|GraniteShares|Roundhill|Invesco QQQ)\b",
    re.IGNORECASE,
)


class DirtyUniverseError(RuntimeError):
    """Raised when the input universe still contains fund/share-class artifacts."""


def _symbol_of(entry: object) -> str:
    if isinstance(entry, dict):
        return str(entry.get("symbol", "")).strip().upper()
    return str(entry).strip().upper()


def _name_of(entry: object) -> str:
    if isinstance(entry, dict):
        return str(entry.get("name", entry.get("companyName", ""))).strip()
    return ""


def assert_clean_universe(entries: list) -> None:
    """Raise DirtyUniverseError if any entry looks like a mutual-fund share class
    or a narrow-list ETF issuer. Works on dict entries or bare symbol strings."""
    offenders: list[str] = []
    for entry in entries:
        symbol = _symbol_of(entry)
        name = _name_of(entry)
        if symbol and _MUTUAL_FUND_TICKER.match(symbol):
            offenders.append(symbol)
        elif name and _ETF_ISSUER_NAME.search(name):
            offenders.append(symbol or name)
    if offenders:
        raise DirtyUniverseError(
            "Input universe still contains fund/share-class artifacts "
            f"({len(offenders)}): {offenders[:20]}. Upstream selectUniverse "
            "(issues #62-63) should have removed these — refusing to score."
        )


def load_universe(path: str | Path) -> list[str]:
    """Load symbols from a compare-universe.json file, asserting cleanliness first."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    entries = data.get("entries", []) if isinstance(data, dict) else data
    assert_clean_universe(entries)
    return [s for e in entries if (s := _symbol_of(e))]
