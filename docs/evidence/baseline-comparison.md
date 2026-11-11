# Simulated reputation baseline comparison

> **Simulation only:** this is a seeded simulation using assumed behavior, not field data or evidence that these behaviors occur in practice.

The simulation runs 200 sequential batches for each actor under 100 reproducible seeds. The plain-average method is the final arithmetic mean of consumer ratings, mapped to basis points (`rating × 1,000`). TABASC applies the contract's default five-factor weights and alpha of 3,000 bps.

| Actor | Mean final TABASC (bps) | TABASC SD (bps) | Mean TABASC across 200 batches (bps) | TABASC mean rank | Mean final plain average (bps) | Plain mean rank | Trust at mean TABASC | Restricted at mean TABASC |
|---|---:|---:|---:|---:|---:|---:|---|---|
| Honest | 9,446.19 | 112.51 | 9,442.88 | 1 | 9,001.30 | 2 | Excellent | No |
| Honest but unlucky | 9,392.94 | 113.41 | 9,380.10 | 2 | 8,789.95 | 3 | Excellent | No |
| Poor but colluding | 5,144.87 | 161.47 | 5,120.03 | 3 | 10,000.00 | 1 | Average | No |

Ranks are ordered by mean final scores, separately for each method. Standard deviations are population SDs across the 100 seeds. The honest and unlucky actors' mean final TABASC scores differ by 53.25 bps, less than one pooled standard deviation (about 112.96 bps), so this simulation does not show a meaningful difference between them under TABASC. Their plain-average means differ by more than one pooled standard deviation, so that method does distinguish them. The colluder ranks last under TABASC but first under plain average.

Trust labels use the contract thresholds (Poor 2,000, Average 4,000, Good 6,000, Excellent 8,000 bps), applied to each actor's mean final TABASC score. The restricted flag is evaluated at 200 batches: score below the lowest threshold of 2,000 bps and at least three finalized batches. The colluder is ranked lowest by TABASC but is **not restricted**, because its mean is 5,144.87 bps.

## Interpretation and limitations

With alpha 3,000 bps, an old score's contribution decays by 0.7 each batch: the EMA's e-folding memory is about 3.3 batches, and about 95% of its weight is on the most recent 9 batches. The colluder ranks lowest under TABASC but remains above the restriction threshold. These outcomes assume an honest inspector and the actor behaviors listed below; they do not establish real-world detection or restriction rates.

Assumptions:

- Honest and honest-but-unlucky receive identical quality, compliance, delivery times, and ratings in each seed and batch, except for six low ratings for the unlucky actor at batches 17, 49, 83, 121, 164, and 193.
- Both honest actors have quality 8,800–10,000 bps, compliance 9,000–10,000 bps, delivery within 0.75–1.0 delivery windows, and ordinary ratings of 8–10. The six unlucky ratings are 1–3.
- The poor colluder has quality 2,500–4,500 bps, compliance 2,000–4,000 bps, delivery at 1.5–2.0 windows, and a controlled fake buyer who always gives 10/10.
- Every batch has an honest inspection and both delivery and feedback available. A rating maps to satisfaction `rating × 1,000` bps and complaint `10,000 − satisfaction`.
- The TABASC calculation uses quality, delivery, complaint, compliance, and satisfaction weights of 3,000, 2,500, 2,000, 1,500, and 1,000 bps, respectively. The EMA starts with the first batch score and uses alpha 3,000 bps afterward.
- The 100 seeds are `0x54414241` through `0x544142A4`; the seeded generator makes the CSV reproducible.
- The simulation excludes administrative penalties, trust restrictions during scoring, missing factors, costs, and other behavior not specified here.

`baseline-comparison.csv` has 600 rows, one per actor and batch count. Each row aggregates that batch position across all 100 seeds and includes mean scores and standard deviations; actor-level summary metrics are included for reference. The JavaScript formulas are checked against the Solidity contract by `test/reputation-sim-parity.test.js`; that parity test is unchanged.
