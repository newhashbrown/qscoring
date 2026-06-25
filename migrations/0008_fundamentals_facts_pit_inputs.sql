-- Extend fundamentals_facts with the as-reported balance-sheet / income inputs
-- a future point-in-time scorer needs to reconstruct the balance-sheet-driven
-- factors (P/B, P/S, EV/EBITDA, ROE, ROA, FCF-yield) as-of each filing date,
-- without a live ratios call (issue #61). Purely additive + nullable: existing
-- rows get NULL, the completeness gate is unchanged, and current scoring is
-- untouched — these fields just accrue for the later, deliberate PIT switch.
ALTER TABLE fundamentals_facts ADD COLUMN total_equity REAL;
ALTER TABLE fundamentals_facts ADD COLUMN total_assets REAL;
ALTER TABLE fundamentals_facts ADD COLUMN total_debt REAL;
ALTER TABLE fundamentals_facts ADD COLUMN cash_and_equivalents REAL;
ALTER TABLE fundamentals_facts ADD COLUMN ebitda REAL;
ALTER TABLE fundamentals_facts ADD COLUMN net_income REAL;
ALTER TABLE fundamentals_facts ADD COLUMN shares_diluted REAL;
