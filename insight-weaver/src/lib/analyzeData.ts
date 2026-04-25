import { ColumnStats, DatasetInfo } from "@/context/DataContext";

function inferType(values: any[]): "numeric" | "categorical" | "datetime" | "boolean" {
  const sample = values.slice(0, 100);
  if (sample.length === 0) return "categorical";
  
  const uniqueStrings = Array.from(new Set(sample.map(v => String(v).toLowerCase().trim())));
  
  // 1. Boolean check
  const isBoolean = uniqueStrings.length > 0 && uniqueStrings.length <= 2 && 
                   uniqueStrings.every(v => ["0", "1", "true", "false", "yes", "no"].includes(v));
  if (isBoolean) return "boolean";

  // 2. Low cardinality check
  if (uniqueStrings.length <= 10) return "categorical";

  // 3. Numeric check
  const numCount = sample.filter(v => {
    if (typeof v === "number") return true;
    const str = String(v).replace(/[, $\s]/g, "");
    return str !== "" && !isNaN(Number(str));
  }).length;
  
  if (numCount / sample.length > 0.8) return "numeric";
  
  // 4. Datetime check
  const dateCount = sample.filter(v => !isNaN(Date.parse(String(v)))).length;
  if (dateCount / sample.length > 0.8) return "datetime";
  
  return "categorical";
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function analyzeDataset(data: Record<string, any>[], fileName: string): DatasetInfo {
  if (!data.length) throw new Error("Empty dataset");
  // Sanitize headers to remove BOM, hidden characters, or whitespace
  const headers = Object.keys(data[0]).map(h => h.trim().replace(/^[\uFEFF\u200B]/g, ""));
  const rows = data.length;
  let missingTotal = 0;
  let duplicateRows = 0;

  // Duplicate detection - skip for very large files to keep UI responsive
  if (rows * headers.length < 500000) {
    const seen = new Set<string>();
    for (let i = 0; i < rows; i++) {
      const key = Object.values(data[i]).join('|');
      if (seen.has(key)) duplicateRows++;
      seen.add(key);
    }
  }

  const columnStats: ColumnStats[] = headers.map(name => {
    let missing = 0;
    const nonMissing: any[] = [];

    // Single pass to get values and count missing
    for (let i = 0; i < rows; i++) {
      const v = data[i][name];
      if (v === null || v === undefined || v === "" || v === "NA" || v === "NaN") {
        missing++;
      } else {
        nonMissing.push(v);
      }
    }
    missingTotal += missing;

    const type = inferType(nonMissing);
    const unique = new Set(nonMissing.map(String)).size;

    const stat: ColumnStats = { name, type, missing, missingPct: (missing / rows) * 100, unique };

    // Heuristic relevance score for Feature Selection
    let score = 0;
    const sensitiveKeywords = ["race", "gender", "sex", "age", "ethnicity", "zip", "hired", "target"];
    const isSensitive = sensitiveKeywords.some(k => name.toLowerCase().includes(k));

    if (type === "numeric") score += 40;
    if (type === "categorical" || type === "boolean") score += 45; 
    if (isSensitive) score += 50;

    const diversityRatio = unique / Math.max(1, rows);
    if (type === "numeric") {
        score += Math.min(40, diversityRatio * 100);
    } else {
        score += Math.min(30, (unique / 5) * 15); 
    }

    score -= (missing / rows) * 40; 
    stat.relevanceScore = Math.max(0, score + (Math.random() * 5)); 

    if (type === "numeric") {
      let sum = 0, min = Infinity, max = -Infinity;
      const numArr: number[] = [];

      for (let i = 0; i < nonMissing.length; i++) {
        const v = Number(nonMissing[i]);
        if (!isNaN(v)) {
          sum += v;
          if (v < min) min = v;
          if (v > max) max = v;
          numArr.push(v);
        }
      }

      if (numArr.length) {
        stat.mean = sum / numArr.length;
        stat.min = min === Infinity ? 0 : min;
        stat.max = max === -Infinity ? 0 : max;
        // fast approx median for large datasets
        stat.median = median(numArr.length > 2000 ? numArr.slice(0, 2000) : numArr);

        let varianceSum = 0;
        for (let i = 0; i < numArr.length; i++) {
          varianceSum += (numArr[i] - stat.mean) ** 2;
        }
        stat.std = Math.sqrt(varianceSum / numArr.length);
      }
    } else {
      const counts: Record<string, number> = {};
      for (let i = 0; i < nonMissing.length; i++) {
        const str = String(nonMissing[i]);
        counts[str] = (counts[str] || 0) + 1;
      }
      stat.topValues = Object.keys(counts)
        .map(k => ({ value: k, count: counts[k] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    }
    return stat;
  });

  return {
    fileName, rows, columns: headers.length,
    missingTotal, missingPct: (missingTotal / (rows * headers.length)) * 100,
    duplicateRows,
    numericCols: columnStats.filter(c => c.type === "numeric").length,
    categoricalCols: columnStats.filter(c => c.type !== "numeric").length,
    columnStats, data, headers,
  };
}
