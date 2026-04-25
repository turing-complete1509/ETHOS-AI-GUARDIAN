import Papa from "papaparse";
import { ColumnStats, DatasetInfo } from "../types/data";

type WorkerStats = {
  name: string;
  type: "numeric" | "categorical" | "datetime" | "boolean";
  missing: number;
  numericCount: number; // Track total numeric occurrences separately
  uniqueSet: Set<string>;
  numericValues: number[]; // Sampling for median/distribution
  categoricalCounts: Record<string, number>;
  sum: number;
  min: number;
  max: number;
};

function inferTypeFromStats(s: WorkerStats, rows: number): "numeric" | "categorical" | "datetime" | "boolean" {
    const totalPresent = rows - s.missing;
    if (totalPresent === 0) return "categorical";
    
    const uniqueValues = Array.from(s.uniqueSet).map(v => v.toLowerCase().trim());
    
    // 1. Boolean check: exclusively 0/1, true/false, yes/no
    const isBoolean = uniqueValues.length > 0 && uniqueValues.length <= 2 && 
                     uniqueValues.every(v => ["0", "1", "true", "false", "yes", "no"].includes(v));
    if (isBoolean) return "boolean";

    // 2. Low cardinality categorical check: treat as categorical if few unique values
    // even if they are numeric (e.g. encoded race/gender/education)
    const isLowCardinality = s.uniqueSet.size > 0 && (
        s.uniqueSet.size <= 12 || 
        (s.uniqueSet.size <= 30 && s.uniqueSet.size / totalPresent < 0.05)
    );
    
    if (isLowCardinality) return "categorical";

    // 3. Numeric check
    if (s.numericCount / totalPresent > 0.8) return "numeric";
    
    // 4. Default
    return "categorical";
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

self.onmessage = (e: MessageEvent) => {
  const { file, fileName, type: fileType, rawData } = e.data;
  
  // If we already have the raw data (e.g. from Excel), we process it synchronously in the worker
  if (rawData) {
    processRawData(rawData, fileName);
    return;
  }

  // Otherwise, we stream the CSV file
  const statsMap: Record<string, WorkerStats> = {};
  let headers: string[] = [];
  let rowCount = 0;
  let missingTotal = 0;
  const previewData: any[] = [];
  const fullData: any[] = []; // We still need to store data for the context, but we do it incrementally

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
    transformHeader: (h) => h.trim().replace(/^[\uFEFF\u200B]/g, "").replace(/[\n\r\t]/g, ""),
    step: (results) => {
      const row = results.data;
      if (rowCount === 0) {
        headers = Object.keys(row);
        headers.forEach(h => {
          statsMap[h] = {
            name: h, type: "categorical", missing: 0,
            numericCount: 0,
            uniqueSet: new Set(),
            numericValues: [], categoricalCounts: {}, sum: 0, min: Infinity, max: -Infinity
          };
        });
      }

      for (const h of headers) {
        const v = row[h];
        const s = statsMap[h];
        if (v === null || v === undefined || v === "" || v === "NA" || v === "NaN") {
          s.missing++;
        } else {
          const strVal = String(v);
          s.uniqueSet.add(strVal);
          
          // Track categorical frequencies if cardinality is reasonably low
          if (Object.keys(s.categoricalCounts).length < 200) {
            s.categoricalCounts[strVal] = (s.categoricalCounts[strVal] || 0) + 1;
          }

          const numVal = Number(strVal.replace(/[, $\s]/g, ""));
          if (!isNaN(numVal) && strVal !== "") {
            s.numericCount++;
            s.sum += numVal;
            if (numVal < s.min) s.min = numVal;
            if (numVal > s.max) s.max = numVal;
            if (s.numericValues.length < 5000) s.numericValues.push(numVal);
          }
        }
      }

      if (rowCount < 100) previewData.push(row);
      fullData.push(row);
      rowCount++;

      if (rowCount % 1000 === 0) {
        // Estimate progress based on byte-offset if available, or just row count increments
        self.postMessage({ type: "progress", progress: Math.min(99, (results.meta.cursor / file.size) * 100) });
      }
    },
    complete: () => {
      finalizeAndSend(statsMap, headers, rowCount, fileName, fullData);
    },
    error: (err) => {
      self.postMessage({ type: "error", message: err.message });
    }
  });
};

function processRawData(data: any[], fileName: string) {
    const rows = data.length;
    const headers = Object.keys(data[0]);
    const statsMap: Record<string, WorkerStats> = {};
    
    headers.forEach(h => {
        statsMap[h] = {
            name: h, type: "categorical", missing: 0,
            numericCount: 0,
            uniqueSet: new Set(),
            numericValues: [], categoricalCounts: {}, sum: 0, min: Infinity, max: -Infinity
        };
    });

    for (let i = 0; i < rows; i++) {
        const row = data[i];
        for (const h of headers) {
            const v = row[h];
            const s = statsMap[h];
            if (v === null || v === undefined || v === "" || v === "NA" || v === "NaN") {
                s.missing++;
            } else {
                const strVal = String(v);
                s.uniqueSet.add(strVal);

                // Track categorical frequencies
                if (Object.keys(s.categoricalCounts).length < 200) {
                    s.categoricalCounts[strVal] = (s.categoricalCounts[strVal] || 0) + 1;
                }

                const numVal = Number(strVal.replace(/[, $\s]/g, ""));
                if (!isNaN(numVal) && strVal !== "") {
                    s.numericCount++;
                    s.sum += numVal;
                    if (numVal < s.min) s.min = numVal;
                    if (numVal > s.max) s.max = numVal;
                    if (s.numericValues.length < 5000) s.numericValues.push(numVal);
                }
            }
        }
        if (i % 500 === 0) self.postMessage({ type: "progress", progress: (i / rows) * 100 });
    }
    finalizeAndSend(statsMap, headers, rows, fileName, data);
}

function finalizeAndSend(statsMap: Record<string, WorkerStats>, headers: string[], rows: number, fileName: string, data: any[]) {
  let missingTotal = 0;
  const columnStats: ColumnStats[] = headers.map(h => {
    const s = statsMap[h];
    missingTotal += s.missing;
    const type = inferTypeFromStats(s, rows);
    const unique = s.uniqueSet.size;
    
    const stat: ColumnStats = {
      name: h, type, missing: s.missing, missingPct: (s.missing / rows) * 100, unique
    };

    // Heuristic relevance score for Feature Selection
    let score = 0;
    const sensitiveKeywords = ["race", "gender", "sex", "age", "ethnicity", "zip", "hired", "target"];
    const isSensitive = sensitiveKeywords.some(k => h.toLowerCase().includes(k));

    if (type === "numeric") score += 40;
    if (type === "categorical" || type === "boolean") score += 45; // High base for categorical/boolean
    if (isSensitive) score += 50; // Heavily protect sensitive features from being dropped

    const diversityRatio = unique / Math.max(1, rows);
    if (type === "numeric") {
        score += Math.min(40, diversityRatio * 100);
    } else {
        // Categorical bonus: even binary features are highly relevant in this context
        score += Math.min(30, (unique / 5) * 15); 
    }
    
    score -= (s.missing / rows) * 40;
    stat.relevanceScore = Math.max(0, score + (Math.random() * 5));

    if (type === "numeric" && s.numericValues.length > 0) {
      const n = s.numericValues.length;
      const mean = s.sum / n;
      stat.mean = mean;
      stat.min = s.min; 
      stat.max = s.max; 
      stat.median = median(s.numericValues);
      
      // Calculate variance and std dev
      let varianceSum = 0;
      for (const val of s.numericValues) {
        varianceSum += (val - mean) ** 2;
      }
      stat.std = Math.sqrt(varianceSum / n);
    } else {
      stat.topValues = Object.entries(s.categoricalCounts)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count).slice(0, 10); // increased preview for EDA
    }
    return stat;
  });

  const info: DatasetInfo = {
    fileName, rows, columns: headers.length, missingTotal,
    missingPct: (missingTotal / (rows * headers.length)) * 100,
    duplicateRows: 0,
    numericCols: columnStats.filter(c => c.type === "numeric").length,
    categoricalCols: columnStats.filter(c => c.type !== "numeric").length,
    columnStats, data, headers
  };

  self.postMessage({ type: "complete", info });
}
