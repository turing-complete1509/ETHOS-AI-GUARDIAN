/**
 * MCAR Test — Little's MCAR Test (simplified JS implementation)
 *
 * For each column with missing values, we test whether the probability
 * of missingness in that column is independent of the observed values in
 * ALL other columns (numeric only for the regression-based proxy test).
 *
 * Steps:
 *  1. Build a binary "is_missing" indicator per target column.
 *  2. Compute the mean of each numeric predictor split by missing / observed.
 *  3. Use a two-sample t-test approximation to derive a per-predictor p-value.
 *  4. Combine into an overall chi-square-like statistic for the column.
 *  5. Classify the pattern as MCAR / MAR / MNAR based on significance.
 *
 * This is a practical browser-friendly approximation of Little's MCAR test.
 */

export type MissingnessPattern = "MCAR" | "MAR" | "MNAR" | "Insufficient Data";

export interface MCARColumnResult {
  column: string;
  missingCount: number;
  missingPct: number;
  pattern: MissingnessPattern;
  chiSquare: number;
  pValue: number;
  degreesOfFreedom: number;
  significantPredictors: string[];  // Other columns correlated with this col's missingness
  interpretation: string;
  recommendation: string;
  confidence: "High" | "Medium" | "Low";
}

export interface MCARTestResult {
  overallPattern: MissingnessPattern;
  overallChiSquare: number;
  overallPValue: number;
  columnResults: MCARColumnResult[];
  mcarColumns: string[];
  marColumns: string[];
  mnarColumns: string[];
  totalMissingCols: number;
  runAt: string;
}

// ─── Chi-square p-value approximation (Wilson-Hilferty) ──────────────────────
function chiSquarePValue(x: number, df: number): number {
  if (df <= 0 || x < 0) return 1;
  // Wilson-Hilferty normal approximation
  const h = 2 / (9 * df);
  const z = (Math.pow(x / df, 1 / 3) - (1 - h)) / Math.sqrt(h);
  return 1 - normalCDF(z);
}

function normalCDF(z: number): number {
  // Abramowitz & Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly =
    t * (0.319381530 +
      t * (-0.356563782 +
        t * (1.781477937 +
          t * (-1.821255978 +
            t * 1.330274429))));
  const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - pdf * poly;
  return z >= 0 ? cdf : 1 - cdf;
}

// ─── Two-sample t-test (Welch) p-value ───────────────────────────────────────
function tTestPValue(group1: number[], group2: number[]): number {
  const n1 = group1.length;
  const n2 = group2.length;
  if (n1 < 2 || n2 < 2) return 1;

  const mean1 = group1.reduce((a, b) => a + b, 0) / n1;
  const mean2 = group2.reduce((a, b) => a + b, 0) / n2;

  const var1 = group1.reduce((a, b) => a + (b - mean1) ** 2, 0) / (n1 - 1);
  const var2 = group2.reduce((a, b) => a + (b - mean2) ** 2, 0) / (n2 - 1);

  const se = Math.sqrt(var1 / n1 + var2 / n2);
  if (se === 0) return 1;

  const t = Math.abs((mean1 - mean2) / se);

  // Welch-Satterthwaite df
  const df =
    Math.pow(var1 / n1 + var2 / n2, 2) /
    (Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1));

  // Two-tailed p-value from t → chi-square(1) approximation
  return chiSquarePValue(t * t, Math.max(1, Math.round(df)));
}

// ─── Main MCAR test ───────────────────────────────────────────────────────────
export function runMCARTest(
  data: Record<string, any>[],
  missingColumns: string[]
): MCARTestResult {
  const n = data.length;

  // Discover numeric predictor columns (exclude the target missing cols too, but include them as predictors for each other)
  const allCols = Object.keys(data[0] || {});
  const numericCols = allCols.filter(col => {
    const sample = data.slice(0, 50).map(r => r[col]).filter(v => v !== null && v !== undefined && v !== "");
    return sample.length > 0 && sample.every(v => !isNaN(Number(v)));
  });

  const columnResults: MCARColumnResult[] = [];

  for (const col of missingColumns) {
    const missingCount = data.filter(r => r[col] === null || r[col] === undefined || r[col] === "").length;
    const missingPct = (missingCount / n) * 100;

    if (missingCount === 0) continue;
    if (missingCount === n) {
      columnResults.push({
        column: col,
        missingCount,
        missingPct,
        pattern: "Insufficient Data",
        chiSquare: 0,
        pValue: 1,
        degreesOfFreedom: 0,
        significantPredictors: [],
        interpretation: "All values are missing — cannot determine pattern.",
        recommendation: "Consider dropping this column entirely.",
        confidence: "Low",
      });
      continue;
    }

    // Build observed / missing index sets
    const missingIdx = data.map((r, i) =>
      (r[col] === null || r[col] === undefined || r[col] === "") ? i : -1
    ).filter(i => i !== -1);
    const observedIdx = data.map((r, i) =>
      (r[col] !== null && r[col] !== undefined && r[col] !== "") ? i : -1
    ).filter(i => i !== -1);

    if (observedIdx.length < 2 || missingIdx.length < 2) {
      columnResults.push({
        column: col,
        missingCount,
        missingPct,
        pattern: "Insufficient Data",
        chiSquare: 0,
        pValue: 1,
        degreesOfFreedom: 0,
        significantPredictors: [],
        interpretation: "Too few observations in one group to run the test.",
        recommendation: "Collect more data before testing this column.",
        confidence: "Low",
      });
      continue;
    }

    // Run t-test for each numeric predictor (excluding the target column itself)
    const predictors = numericCols.filter(c => c !== col);
    const significantPredictors: string[] = [];
    let chiSquareStat = 0;
    let df = 0;

    for (const pred of predictors) {
      const g1 = missingIdx.map(i => Number(data[i][pred])).filter(v => !isNaN(v));
      const g2 = observedIdx.map(i => Number(data[i][pred])).filter(v => !isNaN(v));

      if (g1.length < 2 || g2.length < 2) continue;

      const p = tTestPValue(g1, g2);
      // Convert t^2 to chi-square contribution
      const mean1 = g1.reduce((a, b) => a + b, 0) / g1.length;
      const mean2 = g2.reduce((a, b) => a + b, 0) / g2.length;
      const pooledVar =
        (g1.reduce((a, b) => a + (b - mean1) ** 2, 0) +
          g2.reduce((a, b) => a + (b - mean2) ** 2, 0)) /
        (g1.length + g2.length - 2 + 1e-10);

      const contribution =
        (g1.length * g2.length * (mean1 - mean2) ** 2) /
        ((g1.length + g2.length) * Math.max(pooledVar, 1e-10));

      chiSquareStat += contribution;
      df += 1;

      if (p < 0.05) {
        significantPredictors.push(pred);
      }
    }

    // If no numeric predictors, fall back to proportion-based heuristic
    if (df === 0) {
      const fallbackChi = ((missingPct / 100) * (1 - missingPct / 100) * n) / Math.max(1, n - 1);
      chiSquareStat = fallbackChi;
      df = 1;
    }

    const pValue = chiSquarePValue(chiSquareStat, Math.max(1, df));

    // Classify pattern
    let pattern: MissingnessPattern;
    let interpretation: string;
    let recommendation: string;
    let confidence: "High" | "Medium" | "Low";

    if (df < 2) {
      confidence = "Low";
    } else if (df < 5) {
      confidence = "Medium";
    } else {
      confidence = "High";
    }

    if (pValue >= 0.05) {
      pattern = "MCAR";
      interpretation = `Missingness in "${col}" appears random (p=${pValue.toFixed(3)}). No significant relationship found with other variables.`;
      recommendation = "Safe to use simple imputation (Mean/Median/Mode) or list-wise deletion without introducing bias.";
    } else if (significantPredictors.length > 0) {
      pattern = "MAR";
      interpretation = `Missingness in "${col}" is related to observed values in: ${significantPredictors.slice(0, 3).join(", ")} (p=${pValue.toFixed(3)}). Data is Missing At Random.`;
      recommendation = "Use model-based imputation (MICE, Regression, Random Forest) that leverages the correlated predictors.";
    } else {
      pattern = "MNAR";
      interpretation = `Missingness in "${col}" may depend on the missing values themselves (p=${pValue.toFixed(3)}). Data may be Missing Not At Random.`;
      recommendation = "Consider domain-driven imputation, sensitivity analysis, or flag the missing values as a separate category.";
    }

    columnResults.push({
      column: col,
      missingCount,
      missingPct,
      pattern,
      chiSquare: chiSquareStat,
      pValue,
      degreesOfFreedom: df,
      significantPredictors,
      interpretation,
      recommendation,
      confidence,
    });
  }

  // Overall summary
  const validResults = columnResults.filter(r => r.pattern !== "Insufficient Data");
  const mcarCols = validResults.filter(r => r.pattern === "MCAR").map(r => r.column);
  const marCols = validResults.filter(r => r.pattern === "MAR").map(r => r.column);
  const mnarCols = validResults.filter(r => r.pattern === "MNAR").map(r => r.column);

  const overallChi = validResults.reduce((s, r) => s + r.chiSquare, 0);
  const overallDf = validResults.reduce((s, r) => s + r.degreesOfFreedom, 0);
  const overallPValue = chiSquarePValue(overallChi, Math.max(1, overallDf));

  let overallPattern: MissingnessPattern;
  if (validResults.length === 0) {
    overallPattern = "Insufficient Data";
  } else if (mcarCols.length === validResults.length) {
    overallPattern = "MCAR";
  } else if (marCols.length >= mnarCols.length) {
    overallPattern = "MAR";
  } else {
    overallPattern = "MNAR";
  }

  return {
    overallPattern,
    overallChiSquare: overallChi,
    overallPValue,
    columnResults,
    mcarColumns: mcarCols,
    marColumns: marCols,
    mnarColumns: mnarCols,
    totalMissingCols: columnResults.length,
    runAt: new Date().toISOString(),
  };
}
