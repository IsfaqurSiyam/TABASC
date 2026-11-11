const fs = require('node:fs');
const path = require('node:path');

// Defaults from contracts/ReputationContract.sol:83-85, 413-423, 237-254 and 481-498.
const MODEL = Object.freeze({
  FACTOR_WEIGHTS_BPS: Object.freeze([3000, 2500, 2000, 1500, 1000]),
  ALPHA_BPS: 3000,
  FEEDBACK_SCALE_BPS: 1000,
  DELIVERY_MAX_SCORE_BPS: 10000,
  BATCHES_PER_ACTOR: 200,
  RANDOM_SEED: 0x54414241,
  SEED_COUNT: 100,
  BAD_RATING_BATCHES: Object.freeze([17, 49, 83, 121, 164, 193]),
  TRUST_THRESHOLDS_BPS: Object.freeze([2000, 4000, 6000, 8000])
});

const ACTORS = Object.freeze([
  'Honest',
  'Poor but colluding',
  'Honest but unlucky'
]);

const OUTPUT_PATH = path.resolve(
  __dirname,
  '../../docs/evidence/baseline-comparison.csv'
);

const assertBps = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10000) {
    throw new RangeError(`${label} must be an integer from 0 to 10000 bps`);
  }
};

const calculateDeliveryScore = (elapsed, deliveryWindow) => {
  if (!Number.isSafeInteger(elapsed) || elapsed < 0) {
    throw new RangeError('elapsed must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(deliveryWindow) || deliveryWindow <= 0) {
    throw new RangeError('deliveryWindow must be a positive safe integer');
  }
  if (elapsed <= deliveryWindow) return MODEL.DELIVERY_MAX_SCORE_BPS;
  if (elapsed - deliveryWindow >= deliveryWindow) return 0;
  return MODEL.DELIVERY_MAX_SCORE_BPS -
    Math.floor(((elapsed - deliveryWindow) * MODEL.DELIVERY_MAX_SCORE_BPS) / deliveryWindow);
};

const combine = (values, weights = MODEL.FACTOR_WEIGHTS_BPS, available = [true, true, true, true, true]) => {
  if (values.length !== 5 || weights.length !== 5 || available.length !== 5) {
    throw new RangeError('values, weights, and available must each contain five factors');
  }

  let weightedTotal = 0;
  let availableWeight = 0;
  for (let index = 0; index < 5; index += 1) {
    assertBps(values[index], `values[${index}]`);
    if (!Number.isSafeInteger(weights[index]) || weights[index] < 0) {
      throw new RangeError(`weights[${index}] must be a non-negative safe integer`);
    }
    if (available[index]) {
      weightedTotal += values[index] * weights[index];
      availableWeight += weights[index];
    }
  }
  if (availableWeight === 0) {
    throw new RangeError('at least one available factor must have a non-zero weight');
  }
  return Math.floor(weightedTotal / availableWeight);
};

const updateEma = (previousScore, batchScore, hasPrevious, alpha = MODEL.ALPHA_BPS) => {
  assertBps(batchScore, 'batchScore');
  if (!Number.isSafeInteger(alpha) || alpha < 1 || alpha > 10000) {
    throw new RangeError('alpha must be an integer from 1 to 10000');
  }
  if (!hasPrevious) return batchScore;
  assertBps(previousScore, 'previousScore');
  return Math.floor(
    (previousScore * (10000 - alpha) + batchScore * alpha) / 10000
  );
};

const createRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const randomInt = (random, min, max) => min + Math.floor(random() * (max - min + 1));

const honestScenarioFor = (batchNumber, random) => {
  const deliveryWindow = 86400;
  return {
    quality: randomInt(random, 8800, 10000),
    compliance: randomInt(random, 9000, 10000),
    rating: randomInt(random, 8, 10),
    elapsed: randomInt(random, Math.floor(deliveryWindow * 0.75), deliveryWindow),
    deliveryWindow
  };
};

const colluderScenarioFor = (random) => {
  const deliveryWindow = 86400;
  return {
    quality: randomInt(random, 2500, 4500),
    compliance: randomInt(random, 2000, 4000),
    rating: 10,
    elapsed: randomInt(random, Math.floor(deliveryWindow * 1.5), deliveryWindow * 2),
    deliveryWindow
  };
};

const runActor = (actor, batches) => {
  let ratingTotalBps = 0;
  let tabascScore = 0;
  const rows = [];

  for (let index = 0; index < batches.length; index += 1) {
    const batchNumber = index + 1;
    const batch = batches[index];
    const satisfaction = batch.rating * MODEL.FEEDBACK_SCALE_BPS;
    const complaint = 10000 - satisfaction;
    const deliveryScore = calculateDeliveryScore(batch.elapsed, batch.deliveryWindow);
    const batchScore = combine([
      batch.quality,
      deliveryScore,
      10000 - complaint,
      batch.compliance,
      satisfaction
    ]);
    tabascScore = updateEma(tabascScore, batchScore, batchNumber > 1);
    ratingTotalBps += satisfaction;

    rows.push({
      actor,
      batch_count: batchNumber,
      rating_1_to_10: batch.rating,
      plain_average_rating_bps: Math.floor(ratingTotalBps / batchNumber),
      inspection_quality_bps: batch.quality,
      compliance_bps: batch.compliance,
      delivery_elapsed_seconds: batch.elapsed,
      delivery_window_seconds: batch.deliveryWindow,
      delivery_score_bps: deliveryScore,
      tabasc_batch_score_bps: batchScore,
      tabasc_ema_score_bps: tabascScore
    });
  }
  return rows;
};

const standardDeviation = (values) => {
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  return Math.sqrt(values.reduce((total, value) => total + ((value - mean) ** 2), 0) / values.length);
};

const trustLevelForScore = (score) => {
  const [poor, average, good, excellent] = MODEL.TRUST_THRESHOLDS_BPS;
  if (score >= excellent) return 'Excellent';
  if (score >= good) return 'Good';
  if (score >= average) return 'Average';
  if (score >= poor) return 'Poor';
  return 'Critical';
};

const summarizeRuns = (runs) => ACTORS.map((actor) => {
  const actorRuns = runs.map((run) => run.filter((row) => row.actor === actor));
  const finalTabascScores = actorRuns.map((rows) => rows[rows.length - 1].tabasc_ema_score_bps);
  const finalPlainScores = actorRuns.map((rows) => rows[rows.length - 1].plain_average_rating_bps);
  const allTabascScores = actorRuns.flatMap((rows) => rows.map((row) => row.tabasc_ema_score_bps));
  const meanFinalTabasc = finalTabascScores.reduce((total, value) => total + value, 0) / finalTabascScores.length;
  const meanFinalPlain = finalPlainScores.reduce((total, value) => total + value, 0) / finalPlainScores.length;

  return {
    actor,
    mean_final_tabasc_score_bps: meanFinalTabasc,
    stddev_final_tabasc_score_bps: standardDeviation(finalTabascScores),
    mean_tabasc_score_over_200_batches_bps: allTabascScores.reduce((total, value) => total + value, 0) / allTabascScores.length,
    mean_final_plain_average_bps: meanFinalPlain,
    stddev_final_plain_average_bps: standardDeviation(finalPlainScores),
    trust_level_at_mean_final_score: trustLevelForScore(Math.floor(meanFinalTabasc)),
    restricted_at_mean_final_score: meanFinalTabasc < MODEL.TRUST_THRESHOLDS_BPS[0]
  };
});

const aggregateBatchRows = (runs, summaries) => {
  const summaryByActor = new Map(summaries.map((summary) => [summary.actor, summary]));
  const output = [];

  for (const actor of ACTORS) {
    for (let index = 0; index < MODEL.BATCHES_PER_ACTOR; index += 1) {
      const batchRows = runs.map((run) => run.find((row) => row.actor === actor && row.batch_count === index + 1));
      const tabascScores = batchRows.map((row) => row.tabasc_ema_score_bps);
      const plainScores = batchRows.map((row) => row.plain_average_rating_bps);
      const summary = summaryByActor.get(actor);
      output.push({
        actor,
        batch_count: index + 1,
        seed_count: runs.length,
        mean_rating_1_to_10: batchRows.reduce((total, row) => total + row.rating_1_to_10, 0) / runs.length,
        mean_plain_average_rating_bps: plainScores.reduce((total, value) => total + value, 0) / runs.length,
        stddev_plain_average_rating_bps: standardDeviation(plainScores),
        mean_inspection_quality_bps: batchRows.reduce((total, row) => total + row.inspection_quality_bps, 0) / runs.length,
        mean_compliance_bps: batchRows.reduce((total, row) => total + row.compliance_bps, 0) / runs.length,
        mean_delivery_score_bps: batchRows.reduce((total, row) => total + row.delivery_score_bps, 0) / runs.length,
        mean_tabasc_batch_score_bps: batchRows.reduce((total, row) => total + row.tabasc_batch_score_bps, 0) / runs.length,
        mean_tabasc_ema_score_bps: tabascScores.reduce((total, value) => total + value, 0) / runs.length,
        stddev_tabasc_ema_score_bps: standardDeviation(tabascScores),
        mean_final_tabasc_score_bps: summary.mean_final_tabasc_score_bps,
        stddev_final_tabasc_score_bps: summary.stddev_final_tabasc_score_bps,
        mean_tabasc_score_over_200_batches_bps: summary.mean_tabasc_score_over_200_batches_bps,
        mean_final_plain_average_bps: summary.mean_final_plain_average_bps,
        trust_level_at_mean_final_score: summary.trust_level_at_mean_final_score,
        restricted_at_mean_final_score: summary.restricted_at_mean_final_score
      });
    }
  }
  return output;
};

const csvCell = (value) => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const runSimulations = () => {
  const runs = [];
  for (let seedIndex = 0; seedIndex < MODEL.SEED_COUNT; seedIndex += 1) {
    const seed = (MODEL.RANDOM_SEED + seedIndex) >>> 0;
    const honestRandom = createRandom(seed);
    const colluderRandom = createRandom(seed ^ 0x9E3779B9);
    const honestBatches = Array.from(
      { length: MODEL.BATCHES_PER_ACTOR },
      (_, index) => honestScenarioFor(index + 1, honestRandom)
    );
    const unluckyBatches = honestBatches.map((batch, index) => (
      MODEL.BAD_RATING_BATCHES.includes(index + 1)
        ? { ...batch, rating: randomInt(honestRandom, 1, 3) }
        : { ...batch }
    ));
    const colluderBatches = Array.from(
      { length: MODEL.BATCHES_PER_ACTOR },
      () => colluderScenarioFor(colluderRandom)
    );

    runs.push([
      ...runActor('Honest', honestBatches),
      ...runActor('Poor but colluding', colluderBatches),
      ...runActor('Honest but unlucky', unluckyBatches)
    ]);
  }
  return runs;
};

const simulate = () => {
  const runs = runSimulations();
  const summaries = summarizeRuns(runs);
  return {
    rows: aggregateBatchRows(runs, summaries),
    summaries
  };
};

const writeCsv = () => {
  const results = simulate();
  const { rows } = results;
  const columns = Object.keys(rows[0]);
  const csv = [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))
  ].join('\n') + '\n';
  fs.writeFileSync(OUTPUT_PATH, csv, 'utf8');
  return results;
};

if (require.main === module) {
  const { rows, summaries } = writeCsv();
  console.log(`Wrote ${rows.length} aggregated actor/batch rows to ${OUTPUT_PATH}`);
  console.log(JSON.stringify(summaries, null, 2));
}

module.exports = {
  MODEL,
  calculateDeliveryScore,
  combine,
  updateEma,
  simulate,
  summarizeRuns,
  writeCsv
};
