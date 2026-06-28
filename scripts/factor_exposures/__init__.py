"""Fama-French factor-exposure batch job (offline / GitHub Actions).

Computes per-stock FF 5-factor (2x3) + Momentum exposures by OLS with
Newey-West (HAC) standard errors, then writes an append-only JSON snapshot and
loads it into D1 via the existing authenticated persist endpoint. The Cloudflare
Worker only ever READS the precomputed rows — no regression compute in any
request path.

Statistical compute uses AUDITED libraries (statsmodels) rather than hand-rolled
OLS/HAC, mirroring the philosophy of research/ (see research/README.md).
"""
