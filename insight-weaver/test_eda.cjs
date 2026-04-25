const fs = require('fs');

// We simulate EdaPage logic. Let's create dummy data.
const dataset = {
  data: Array(2500).fill(0).map(() => ({
    A: Math.random() * 100,
    B: Math.random() > 0.5 ? Math.random() * 50 : undefined,
    C: null,
    D: "some string",
    E: 42
  })),
  columnStats: [
    { name: "A", type: "numeric", min: 0, max: 100, mean: 50, std: 25, median: 50 },
    { name: "B", type: "numeric", min: 0, max: 50, mean: 25, std: 12, median: 25 },
    { name: "C", type: "numeric", min: undefined },
    { name: "D", type: "categorical" },
    { name: "E", type: "numeric", min: 42, max: 42, mean: 42, std: 0, median: 42 },
  ]
};

const numericCols = dataset.columnStats.filter(c => c.type === "numeric").map(c => c.name);
const selectedCol = "B";

const boxplotData = (() => {
  const col = dataset.columnStats.find(c => c.name === selectedCol);
  if (!col || col.type !== "numeric" || col.min === undefined) return null;
  return { min: col.min, q1: col.mean - col.std, median: col.median, q3: col.mean + col.std, max: col.max, mean: col.mean };
})();
console.log("boxplotData:", boxplotData);

const histogramData = (() => {
  const col = dataset.columnStats.find(c => c.name === selectedCol);
  if (!col || col.type !== "numeric") return [];
  const vals = dataset.data.map(r => Number(r[selectedCol])).filter(v => !isNaN(v));
  if (!vals.length) return [];
  let min = Infinity, max = -Infinity;
  for (let k = 0; k < vals.length; k++) {
    if (vals[k] < min) min = vals[k];
    if (vals[k] > max) max = vals[k];
  }
  const bins = 20;
  const binWidth = (max - min) / bins || 1;
  const counts = Array(bins).fill(0);
  vals.forEach(v => { const i = Math.min(Math.floor((v - min) / binWidth), bins - 1); counts[i]++; });
  return counts.map((count, i) => ({ range: (min + i * binWidth).toFixed(1), count }));
})();
console.log("histogram", histogramData.slice(0, 2));

const correlationData = (() => {
  const pairs = [];
  for (let i = 0; i < Math.min(numericCols.length, 8); i++) {
    for (let j = i + 1; j < Math.min(numericCols.length, 8); j++) {
      const xVals = dataset.data.map(r => Number(r[numericCols[i]])).filter(v => !isNaN(v));
      const yVals = dataset.data.map(r => Number(r[numericCols[j]])).filter(v => !isNaN(v));
      const n = Math.min(xVals.length, yVals.length);
      if (n < 3) continue;
      const mx = xVals.slice(0, n).reduce((a, b) => a + b) / n;
      const my = yVals.slice(0, n).reduce((a, b) => a + b) / n;
      let num = 0, dx = 0, dy = 0;
      for (let k = 0; k < n; k++) {
        num += (xVals[k] - mx) * (yVals[k] - my);
        dx += (xVals[k] - mx) ** 2;
        dy += (yVals[k] - my) ** 2;
      }
      const corr = dx && dy ? num / Math.sqrt(dx * dy) : 0;
      pairs.push({ x: numericCols[i], y: numericCols[j], corr: Math.round(corr * 100) / 100 });
    }
  }
  return pairs;
})();
console.log("correlationData", correlationData);

console.log("SUCCESS!");
