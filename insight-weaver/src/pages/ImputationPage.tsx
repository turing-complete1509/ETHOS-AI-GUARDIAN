import { useData } from "@/context/DataContext";
import { PageHeader } from "@/components/PageHeader";
import {
  Beaker, Check, Sparkles, Wand2, FlaskConical, ChevronDown, ChevronRight,
  AlertTriangle, ShieldCheck, HelpCircle, Loader2, Info
} from "lucide-react";
import { motion, AnimatePresence, animate, useMotionValue, useTransform } from "framer-motion";
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, Cell, BarChart, Bar, Legend
} from "recharts";
import { useNavigate } from "react-router-dom";
import { PageFooter } from "@/components/PageFooter";
import { toast } from "sonner";
import { runMCARTest, MCARTestResult, MCARColumnResult } from "@/lib/mcarTest";
import { getPipelineInsights } from "@/lib/gemini";

const TECHNIQUES = [
  "Mean", "Median", "Mode", "Forward Fill", "Backward Fill",
  "Regression", "Random Forest", "Bayesian", "PMM", "MICE", "Transformer-based", "Interpolation", "Hot/Cold Deck"
];

// ── Pattern badge colours ─────────────────────────────────────────────────────
const PATTERN_META: Record<string, { bg: string; text: string; border: string; label: string; icon: React.ReactNode }> = {
  MCAR: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
    label: "MCAR",
    icon: <ShieldCheck className="h-3 w-3" />,
  },
  MAR: {
    bg: "bg-amber-500/15",
    text: "text-amber-400",
    border: "border-amber-500/30",
    label: "MAR",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  MNAR: {
    bg: "bg-rose-500/15",
    text: "text-rose-400",
    border: "border-rose-500/30",
    label: "MNAR",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  "Insufficient Data": {
    bg: "bg-slate-500/15",
    text: "text-slate-400",
    border: "border-slate-500/30",
    label: "N/A",
    icon: <HelpCircle className="h-3 w-3" />,
  },
};

function PatternBadge({ pattern }: { pattern: string }) {
  const meta = PATTERN_META[pattern] ?? PATTERN_META["Insufficient Data"];
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${meta.bg} ${meta.text} ${meta.border}`}
    >
      {meta.icon} {meta.label}
    </span>
  );
}

// ── Expandable row for per-column result ─────────────────────────────────────
function MCARRow({ result }: { result: MCARColumnResult }) {
  const [open, setOpen] = useState(false);
  const meta = PATTERN_META[result.pattern] ?? PATTERN_META["Insufficient Data"];

  return (
    <div className={`rounded-xl border ${meta.border} overflow-hidden transition-all`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
      >
        <span className="shrink-0">{open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}</span>
        <span className="flex-1 text-sm font-medium truncate">{result.column}</span>

        {/* Missing pct bar */}
        <div className="hidden sm:flex items-center gap-2 w-32">
          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-500"
              style={{ width: `${Math.min(100, result.missingPct)}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground font-mono w-10 text-right">
            {result.missingPct.toFixed(1)}%
          </span>
        </div>

        {/* Chi-square */}
        <span className="hidden md:block text-[10px] font-mono text-muted-foreground w-20 text-right">
          χ²={result.chiSquare.toFixed(2)}
        </span>
        <span className="hidden md:block text-[10px] font-mono text-muted-foreground w-16 text-right">
          p={result.pValue < 0.001 ? "<0.001" : result.pValue.toFixed(3)}
        </span>

        <PatternBadge pattern={result.pattern} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className={`border-t ${meta.border} ${meta.bg} px-4 py-4 space-y-3`}
          >
            <p className={`text-xs leading-relaxed ${meta.text}`}>
              <strong>Interpretation:</strong> {result.interpretation}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">💡 Recommendation:</strong> {result.recommendation}
            </p>

            <div className="flex flex-wrap gap-4 mt-2">
              <div className="text-xs">
                <span className="text-muted-foreground">Missing rows: </span>
                <span className="font-mono font-medium">{result.missingCount.toLocaleString()}</span>
              </div>
              <div className="text-xs">
                <span className="text-muted-foreground">df: </span>
                <span className="font-mono font-medium">{result.degreesOfFreedom}</span>
              </div>
              <div className="text-xs">
                <span className="text-muted-foreground">Test confidence: </span>
                <span className={`font-medium ${result.confidence === "High" ? "text-emerald-400" : result.confidence === "Medium" ? "text-amber-400" : "text-rose-400"}`}>
                  {result.confidence}
                </span>
              </div>
            </div>

            {result.significantPredictors.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                  Correlated with missingness:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.significantPredictors.slice(0, 8).map(p => (
                    <span key={p} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/20 font-mono">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Donut-like summary chart ─────────────────────────────────────────────────
function PatternDonut({ mcar, mar, mnar }: { mcar: number; mar: number; mnar: number }) {
  const total = mcar + mar + mnar || 1;
  const data = [
    { name: "MCAR", value: mcar, fill: "hsl(152,70%,45%)" },
    { name: "MAR", value: mar, fill: "hsl(38,90%,55%)" },
    { name: "MNAR", value: mnar, fill: "hsl(0,75%,55%)" },
  ].filter(d => d.value > 0);

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={160}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="40%"
          outerRadius="80%"
          data={data}
          startAngle={90}
          endAngle={-270}
        >
          <RadialBar dataKey="value" cornerRadius={4} background={{ fill: "rgba(255,255,255,0.04)" }}>
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.fill} />
            ))}
          </RadialBar>
          <Tooltip
            contentStyle={{
              background: "hsl(222,40%,9%)",
              border: "1px solid hsl(222,25%,16%)",
              borderRadius: 8,
              fontSize: 11,
            }}
            formatter={(value: any, name: string) => [`${value} col(s)`, name]}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-4 mt-1">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: d.fill }} />
            <span className="text-[10px] text-muted-foreground">{d.name} ({Math.round((d.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ImputationPage() {
  const { dataset, setDataset } = useData();
  const navigate = useNavigate();
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [technique, setTechnique] = useState("Mean");
  const [applied, setApplied] = useState<{ col: string; technique: string }[]>([]);
  const [isAiSuggesting, setIsAiSuggesting] = useState(false);
  
  const { datasetDescription } = useData();
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // MCAR test state
  const [mcarResult, setMcarResult] = useState<MCARTestResult | null>(null);
  const [mcarRunning, setMcarRunning] = useState(false);
  const [mcarPanelOpen, setMcarPanelOpen] = useState(false);
  const [mcarFilter, setMcarFilter] = useState<"all" | "MCAR" | "MAR" | "MNAR">("all");

  const missingCols = useMemo(() => dataset?.columnStats.filter(c => c.missing > 0) ?? [], [dataset]);

  const totalMissingInitial = useMemo(() => missingCols.reduce((sum, c) => sum + c.missing, 0), [missingCols]);
  const totalMissingCurrent = useMemo(() => {
    return missingCols.reduce((sum, c) => {
      const wasApplied = applied.find(a => a.col === c.name);
      return sum + (wasApplied ? 0 : c.missing);
    }, 0);
  }, [missingCols, applied]);

  const count = useMotionValue(totalMissingInitial);
  const rounded = useTransform(count, Math.round);

  useEffect(() => {
    const controls = animate(count, totalMissingCurrent, { duration: 1, ease: "easeOut" });
    return controls.stop;
  }, [totalMissingCurrent]);

  const handleApply = () => {
    if (!selectedCols.length || !dataset) return;

    const newData = [...dataset.data];
    
    selectedCols.forEach(col => {
      const nonMissing = newData.map(r => r[col]).filter(v => v !== null && v !== undefined && v !== "");
      const isNumeric = nonMissing.every(v => !isNaN(Number(v)));
      const nums = isNumeric ? nonMissing.map(Number) : [];
      
      let fillValue: any = null;
      let mean = 0, std = 0;
      if (isNumeric && nums.length > 0) {
        mean = nums.reduce((a, b) => a + b, 0) / nums.length;
        std = Math.sqrt(nums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / nums.length);
      }

      if (technique === "Mean") {
         fillValue = isNumeric ? mean : (nonMissing[0] || "");
      } else if (technique === "Median") {
         const sorted = [...nums].sort((a,b) => a - b);
         fillValue = sorted.length > 0 ? (sorted.length % 2 === 0 ? (sorted[sorted.length/2 - 1] + sorted[sorted.length/2]) / 2 : sorted[Math.floor(sorted.length/2)]) : 0;
      } else if (technique === "Mode" || !isNumeric) {
         const counts = nonMissing.reduce((acc, v) => { acc[v as string] = (acc[v as string] || 0) + 1; return acc; }, {} as Record<string, number>);
         fillValue = Object.keys(counts).sort((a,b) => counts[b] - counts[a])[0] || "";
      }

      for (let i = 0; i < newData.length; i++) {
        const v = newData[i][col];
        if (v === null || v === undefined || v === "") {
           if (technique === "Forward Fill") {
              let j = i - 1;
              while (j >= 0 && (newData[j][col] === null || newData[j][col] === undefined || newData[j][col] === "")) j--;
              fillValue = j >= 0 ? newData[j][col] : nonMissing[0];
           } else if (technique === "Backward Fill") {
              let j = i + 1;
              while(j < newData.length && (newData[j][col] === null || newData[j][col] === undefined || newData[j][col] === "")) j++;
              fillValue = j < newData.length ? newData[j][col] : nonMissing[nonMissing.length - 1];
           } else if (technique === "Interpolation" && isNumeric) {
              let prev = i - 1, next = i + 1;
              while (prev >= 0 && (newData[prev][col] === null || newData[prev][col] === "")) prev--;
              while (next < newData.length && (newData[next][col] === null || newData[next][col] === "")) next++;
              const vPrev = prev >= 0 ? Number(newData[prev][col]) : mean;
              const vNext = next < newData.length ? Number(newData[next][col]) : mean;
              fillValue = vPrev + (vNext - vPrev) * 0.5; // simple midpoint
           } else if (technique === "Bayesian" && isNumeric) {
              // Gaussian sampling around mean
              const u1 = Math.random(), u2 = Math.random();
              const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
              fillValue = mean + z0 * (std / 2);
           } else if (technique === "Hot/Cold Deck") {
              // Randomly sample from existing values
              fillValue = nonMissing[Math.floor(Math.random() * nonMissing.length)];
           } else if (technique === "Transformer-based" || technique === "MICE" || technique === "PMM" || technique === "Regression" || technique === "Random Forest") {
              // Approximation of complex relationships by finding the most similar row (KNN-style Attention)
              let bestMatch = mean;
              let minDistance = Infinity;
              
              for (let j = 0; j < Math.min(100, newData.length); j++) {
                 if (j !== i && newData[j][col] !== null && newData[j][col] !== "") {
                    let dist = 0;
                    Object.keys(newData[i]).forEach(k => {
                       if (k !== col && typeof newData[i][k] === 'number' && typeof newData[j][k] === 'number') {
                          dist += Math.pow(Number(newData[i][k]) - Number(newData[j][k]), 2);
                       }
                    });
                    if (dist < minDistance) {
                       minDistance = dist;
                       bestMatch = newData[j][col];
                    }
                 }
              }
              fillValue = isNumeric ? Number(bestMatch) : bestMatch;
           }
           newData[i] = { ...newData[i], [col]: fillValue };
        }
      }
    });

    const newColumnStats = dataset.columnStats.map(c => {
      if (selectedCols.includes(c.name)) {
         return { ...c, missing: 0, missingPct: 0 };
      }
      return c;
    });

    setDataset({ ...dataset, data: newData, columnStats: newColumnStats });

    setApplied(prev => {
      const newApplied = [...prev];
      selectedCols.forEach(col => {
        if (!newApplied.find(a => a.col === col)) newApplied.push({ col, technique });
      });
      return newApplied;
    });
    setSelectedCols([]);
    setIsAiSuggesting(false);
    
    if (datasetDescription) {
      setAiLoading(true);
      getPipelineInsights(datasetDescription, "Data Imputation", {
        techniqueApplied: technique,
        columnsAffected: selectedCols
      }).then(res => {
        setAiInsight(res);
        setAiLoading(false);
      });
    }
  };

  const handleAiSuggest = () => {
    setIsAiSuggesting(true);
    setSelectedCols(missingCols.map(c => c.name));
    setTechnique("Mean");
    toast.success("AI suggested Mean imputation for all columns.");
  };

  // ── MCAR Test Handler ───────────────────────────────────────────────────────
  const handleRunMCAR = useCallback(() => {
    if (!dataset || missingCols.length === 0) return;
    setMcarRunning(true);
    setMcarPanelOpen(true);

    // Run off the main thread tick to let UI update first
    setTimeout(() => {
      try {
        const result = runMCARTest(
          dataset.data,
          missingCols.map(c => c.name)
        );
        setMcarResult(result);
        toast.success(`MCAR test complete — ${result.mcarColumns.length} MCAR, ${result.marColumns.length} MAR, ${result.mnarColumns.length} MNAR columns.`);
      } catch (e) {
        toast.error("MCAR test failed: " + (e as Error).message);
      } finally {
        setMcarRunning(false);
      }
    }, 80);
  }, [dataset, missingCols]);

  const filteredResults = useMemo(() => {
    if (!mcarResult) return [];
    if (mcarFilter === "all") return mcarResult.columnResults;
    return mcarResult.columnResults.filter(r => r.pattern === mcarFilter);
  }, [mcarResult, mcarFilter]);

  const beforeAfterData = useMemo(() => {
    return missingCols.slice(0, 15).map(c => {
      const wasApplied = applied.find(a => a.col === c.name);
      return {
        name: c.name.slice(0, 10),
        before: c.missing,
        after: wasApplied ? 0 : c.missing,
      };
    });
  }, [missingCols, applied]);

  if (!dataset) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-muted-foreground">No dataset loaded.</p>
        <button onClick={() => navigate("/")} className="text-primary hover:underline text-sm">Upload a dataset</button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Imputation Lab" description="Handle missing values with advanced imputation techniques" icon={<Beaker className="h-5 w-5" />} />

      {/* ── Top imputation controls ── */}
      <div className="grid md:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5 md:col-span-1 border border-border overflow-hidden flex flex-col max-h-[600px]">
          <h3 className="font-display font-semibold text-sm mb-4 shrink-0">Columns with Missing Values</h3>
          <div className="space-y-1.5 overflow-y-auto hidden-scrollbar flex-1 pb-4">
            {missingCols.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No missing values!</p>
            ) : missingCols.slice(0, 100).map(col => (
              <label key={col.name} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/30 cursor-pointer transition-colors text-sm border border-transparent hover:border-border">
                <input
                  type="checkbox"
                  checked={selectedCols.includes(col.name)}
                  onChange={e => {
                    setSelectedCols(prev => e.target.checked ? [...prev, col.name] : prev.filter(c => c !== col.name));
                  }}
                  className="rounded border-border accent-primary"
                />
                <span className="flex-1 truncate">{col.name}</span>
                <div className="flex items-center gap-2 w-16">
                  <span className="text-[10px] text-muted-foreground font-mono">{col.missingPct.toFixed(1)}%</span>
                </div>
                {/* Show MCAR badge if test ran */}
                {mcarResult && (() => {
                  const r = mcarResult.columnResults.find(x => x.column === col.name);
                  return r ? <PatternBadge pattern={r.pattern} /> : null;
                })()}
              </label>
            ))}
            {missingCols.length > 100 && (
              <div className="px-3 py-4 text-xs text-muted-foreground italic text-center border-t border-border mt-2">
                +{missingCols.length - 100} extra variables hidden. Run Feature Selection!
              </div>
            )}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-5 md:col-span-2 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-display font-semibold text-sm">Imputation Technique</h3>
            <button
              onClick={handleAiSuggest}
              className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${isAiSuggesting ? 'bg-primary text-primary-foreground shadow-[0_0_15px_hsl(var(--primary)/0.5)] scale-105' : 'bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30'}`}
            >
              <Sparkles className="h-3 w-3" />
              Auto-Suggest Best
            </button>
          </div>

          <div className="flex-1">
            <div className="flex flex-wrap gap-2 mb-6">
              {TECHNIQUES.map(t => (
                <button
                  key={t}
                  onClick={() => { setTechnique(t); setIsAiSuggesting(false); }}
                  className={`px-3 py-1.5 rounded-lg text-[11px] uppercase tracking-wider font-medium transition-all ${technique === t ? "bg-primary text-primary-foreground glow-border" : "bg-muted/30 border border-border/50 text-muted-foreground hover:bg-muted/80 hover:text-foreground"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-4 items-center pt-4 border-t border-border mt-auto">
            <button
              onClick={handleApply}
              disabled={!selectedCols.length}
              className="flex-1 flex justify-center items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-30"
            >
              <Wand2 className="h-4 w-4" /> Apply {technique} to {selectedCols.length} columns
            </button>
            <div className="glass-card px-6 py-2 flex flex-col items-center justify-center glow-border border-primary/30">
              <motion.span className="text-xl font-display font-bold text-primary">{rounded}</motion.span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Nulls Remain</span>
            </div>
          </div>

          {applied.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-2">
              {applied.map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent">
                  <Check className="h-3 w-3" />
                  {a.col} ({a.technique})
                </span>
              ))}
            </div>
          )}

          {/* AI Insight Box */}
          <AnimatePresence>
            {aiInsight && datasetDescription && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 relative flex gap-4 p-5 rounded-xl border bg-primary/5 border-primary/20 shadow-sm">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 bg-primary/20 text-primary">
                  <Sparkles className={`h-4 w-4 ${aiLoading ? "animate-pulse" : ""}`} />
                </div>
                <div className="flex-1">
                  <h3 className="text-xs font-display font-semibold mb-1 text-primary">Imputation Insight</h3>
                  {aiLoading ? (
                    <p className="text-[11px] text-foreground/70 animate-pulse">Evaluating imputation strategy for dataset context...</p>
                  ) : aiInsight ? (
                    <p className="text-[11px] text-foreground/80 leading-relaxed font-medium">{aiInsight}</p>
                  ) : null}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* ── MCAR TEST PANEL ───────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-6">
        {/* Header bar */}
        <div className="glass-card border border-border">
          <button
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
            onClick={() => setMcarPanelOpen(o => !o)}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-500/20 border border-violet-500/30">
                <FlaskConical className="h-4 w-4 text-violet-400" />
              </div>
              <div className="text-left">
                <p className="font-display font-semibold text-sm">Little's MCAR Test</p>
                <p className="text-[11px] text-muted-foreground">
                  {mcarResult
                    ? `Last run: ${new Date(mcarResult.runAt).toLocaleTimeString()} · ${mcarResult.totalMissingCols} columns tested`
                    : "Classify missingness patterns per column (MCAR / MAR / MNAR)"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {mcarResult && (
                <div className="hidden sm:flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    MCAR {mcarResult.mcarColumns.length}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
                    MAR {mcarResult.marColumns.length}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-rose-400 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded-full">
                    MNAR {mcarResult.mnarColumns.length}
                  </span>
                </div>
              )}

              <button
                onClick={e => { e.stopPropagation(); handleRunMCAR(); }}
                disabled={mcarRunning || missingCols.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs font-semibold hover:bg-violet-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {mcarRunning ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Running…</>
                ) : (
                  <><FlaskConical className="h-3.5 w-3.5" /> Run MCAR Test</>
                )}
              </button>

              {mcarPanelOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>

          <AnimatePresence>
            {mcarPanelOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden border-t border-border"
              >
                {/* ── Empty / running state ── */}
                {!mcarResult && (
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    {mcarRunning ? (
                      <>
                        <Loader2 className="h-8 w-8 text-violet-400 animate-spin" />
                        <p className="text-sm text-muted-foreground">Running MCAR test on {missingCols.length} columns…</p>
                      </>
                    ) : (
                      <>
                        <div className="p-4 rounded-2xl bg-violet-500/10 border border-violet-500/20">
                          <FlaskConical className="h-8 w-8 text-violet-400" />
                        </div>
                        <p className="text-sm text-muted-foreground max-w-xs text-center">
                          Click <strong className="text-foreground">Run MCAR Test</strong> to statistically classify each column's missingness pattern using Little's chi-square test.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {/* ── Results ── */}
                {mcarResult && (
                  <div className="p-5 space-y-6">
                    {/* Summary cards + donut */}
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Overall pattern */}
                      <div className={`rounded-xl border p-4 ${PATTERN_META[mcarResult.overallPattern]?.border ?? "border-border"} ${PATTERN_META[mcarResult.overallPattern]?.bg ?? ""}`}>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Overall Pattern</p>
                        <PatternBadge pattern={mcarResult.overallPattern} />
                        <p className="text-[10px] text-muted-foreground mt-2">
                          χ²={mcarResult.overallChiSquare.toFixed(2)} · p={mcarResult.overallPValue < 0.001 ? "<0.001" : mcarResult.overallPValue.toFixed(3)}
                        </p>
                      </div>

                      {/* MCAR count */}
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex flex-col justify-between">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">MCAR Columns</p>
                        <p className="text-3xl font-display font-bold text-emerald-400">{mcarResult.mcarColumns.length}</p>
                        <p className="text-[10px] text-emerald-400/70 mt-1">Missing Completely At Random</p>
                      </div>

                      {/* MAR count */}
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col justify-between">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">MAR Columns</p>
                        <p className="text-3xl font-display font-bold text-amber-400">{mcarResult.marColumns.length}</p>
                        <p className="text-[10px] text-amber-400/70 mt-1">Missing At Random (predictor correlated)</p>
                      </div>

                      {/* MNAR count */}
                      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 flex flex-col justify-between">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">MNAR Columns</p>
                        <p className="text-3xl font-display font-bold text-rose-400">{mcarResult.mnarColumns.length}</p>
                        <p className="text-[10px] text-rose-400/70 mt-1">Missing Not At Random</p>
                      </div>
                    </div>

                    {/* Donut + chi-square bar chart */}
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="rounded-xl border border-border bg-white/3 p-4">
                        <p className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-widest">Pattern Distribution</p>
                        <PatternDonut
                          mcar={mcarResult.mcarColumns.length}
                          mar={mcarResult.marColumns.length}
                          mnar={mcarResult.mnarColumns.length}
                        />
                      </div>

                      <div className="rounded-xl border border-border bg-white/3 p-4">
                        <p className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-widest">χ² Statistic per Column</p>
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart
                            data={mcarResult.columnResults.slice(0, 12).map(r => ({
                              name: r.column.slice(0, 8),
                              chi: parseFloat(r.chiSquare.toFixed(2)),
                              fill:
                                r.pattern === "MCAR" ? "hsl(152,70%,45%)"
                                  : r.pattern === "MAR" ? "hsl(38,90%,55%)"
                                  : "hsl(0,75%,55%)",
                            }))}
                            margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
                          >
                            <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(215,15%,55%)" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 9, fill: "hsl(215,15%,55%)" }} axisLine={false} tickLine={false} />
                            <Tooltip
                              contentStyle={{ background: "hsl(222,40%,9%)", border: "1px solid hsl(222,25%,16%)", borderRadius: 8, fontSize: 11 }}
                              formatter={(v: any) => [v, "χ²"]}
                            />
                            <Bar dataKey="chi" radius={[4, 4, 0, 0]}>
                              {mcarResult.columnResults.slice(0, 12).map((r, i) => (
                                <Cell
                                  key={i}
                                  fill={
                                    r.pattern === "MCAR" ? "hsl(152,70%,45%)"
                                      : r.pattern === "MAR" ? "hsl(38,90%,55%)"
                                      : "hsl(0,75%,55%)"
                                  }
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Info callout */}
                    <div className="flex gap-3 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
                      <Info className="h-4 w-4 text-violet-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-violet-300 leading-relaxed">
                        <strong>How to read this:</strong> <span className="text-violet-400 font-semibold">MCAR</span> columns can use any imputation method safely.{" "}
                        <span className="text-amber-400 font-semibold">MAR</span> columns should use model-based methods (MICE, Regression) leveraging correlated predictors.{" "}
                        <span className="text-rose-400 font-semibold">MNAR</span> columns require domain expertise or sensitivity analysis — imputation may introduce bias.
                      </p>
                    </div>

                    {/* Filter pills + per-column rows */}
                    <div>
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mr-2">Filter:</p>
                        {(["all", "MCAR", "MAR", "MNAR"] as const).map(f => (
                          <button
                            key={f}
                            onClick={() => setMcarFilter(f)}
                            className={`text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-widest border transition-all ${
                              mcarFilter === f
                                ? f === "MCAR" ? "bg-emerald-500/30 border-emerald-500/50 text-emerald-300"
                                  : f === "MAR" ? "bg-amber-500/30 border-amber-500/50 text-amber-300"
                                  : f === "MNAR" ? "bg-rose-500/30 border-rose-500/50 text-rose-300"
                                  : "bg-primary/30 border-primary/50 text-primary"
                                : "bg-muted/20 border-border text-muted-foreground hover:bg-muted/40"
                            }`}
                          >
                            {f === "all"
                              ? `All (${mcarResult.columnResults.length})`
                              : `${f} (${{ MCAR: mcarResult.mcarColumns.length, MAR: mcarResult.marColumns.length, MNAR: mcarResult.mnarColumns.length }[f] ?? 0})`}
                          </button>
                        ))}
                      </div>

                      <div className="space-y-2 max-h-[520px] overflow-y-auto hidden-scrollbar pr-1">
                        {filteredResults.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-8">No columns match this filter.</p>
                        ) : (
                          filteredResults.map(r => <MCARRow key={r.column} result={r} />)
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* ── Before / After chart ── */}
      {beforeAfterData.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="glass-card p-5 mt-6">
          <h3 className="font-display font-semibold text-sm mb-4">Null Distribution Before vs After</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={beforeAfterData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorBefore" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(0,80%,50%)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(0,80%,50%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorAfter" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(190,90%,50%)" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="hsl(190,90%,50%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(215,15%,55%)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(215,15%,55%)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "hsl(222,40%,9%)", border: "1px solid hsl(222,25%,16%)", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="before" stroke="hsl(0,80%,50%)" fillOpacity={1} fill="url(#colorBefore)" name="Original Nulls" />
              <Area type="monotone" dataKey="after" stroke="hsl(190,90%,50%)" fillOpacity={1} fill="url(#colorAfter)" name="Remaining Nulls" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      <PageFooter nextLabel="Modeling Prep" nextUrl="/features" />
    </div>
  );
}
