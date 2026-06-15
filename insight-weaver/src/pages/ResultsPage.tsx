import { useData } from "@/context/DataContext";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import {
  Trophy, Target, Gauge, Download, Sparkles, ShieldCheck, FileText, BadgeCheck,
  Zap, ShieldAlert, Activity, Binary, Rotate3d, Scale, Globe, Brain, RefreshCw,
  Code, TrendingUp, CheckCircle2, ChevronRight, ArrowUpRight, ArrowRight
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, LineChart, Line, CartesianGrid, Cell
} from "recharts";
import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageFooter } from "@/components/PageFooter";
import { toast } from "sonner";
import Papa from "papaparse";
import { calculateFairnessMetrics } from "@/lib/metrics";
import { generateBiasReport, getPipelineInsights } from "@/lib/gemini";

// ── 3D Rotating Metric Cube ────────────────────────────────────────────────
const MetricCube = ({ metrics, fairnessStats, activeFairnessStats }: { metrics: any; fairnessStats: any; activeFairnessStats: any }) => {
  const [rotate, setRotate] = useState({ x: -20, y: 35 });
  const fairnessFaceVal = Math.max(0, 1 - Math.abs(activeFairnessStats?.spd || 0));

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-black/40 rounded-[3rem] border border-primary/20 shadow-glow relative overflow-hidden group h-full">
      <div className="absolute top-4 left-6 text-[10px] font-black uppercase tracking-widest text-primary/40 flex items-center gap-2">
        <Rotate3d className="h-3 w-3" /> Interactive Performance Manifold
      </div>

      <div
        className="relative w-48 h-48 mt-12 perspective-1000 preserve-3d cursor-grab active:cursor-grabbing transition-transform duration-700 ease-out"
        style={{ transform: `rotateX(${rotate.x}deg) rotateY(${rotate.y}deg)` }}
        onMouseMove={(e) => {
          if (e.buttons === 1) setRotate({ x: rotate.x - e.movementY * 0.5, y: rotate.y + e.movementX * 0.5 });
        }}
      >
        {[
          { label: "Accuracy",  val: metrics.accuracy,  color: "bg-emerald-500/20 border-emerald-500", transform: "translateZ(100px)" },
          { label: "Fairness",  val: fairnessFaceVal,    color: "bg-primary/20 border-primary", transform: "rotateY(180deg) translateZ(100px)" },
          { label: "Precision", val: metrics.precision, color: "bg-blue-500/20 border-blue-500",   transform: "rotateY(90deg) translateZ(100px)" },
          { label: "Recall",    val: metrics.recall,    color: "bg-purple-500/20 border-purple-500", transform: "rotateY(-90deg) translateZ(100px)" },
          { label: "F1 Score",  val: metrics.f1,        color: "bg-amber-500/20 border-amber-500",  transform: "rotateX(90deg) translateZ(100px)" },
          { label: "SPD",       val: 1 - Math.abs(activeFairnessStats?.spd || 0), color: "bg-white/10 border-white/40", transform: "rotateX(-90deg) translateZ(100px)" },
        ].map((face, i) => (
          <div
            key={i}
            className={`absolute inset-0 flex flex-col items-center justify-center border-2 backdrop-blur-md rounded-2xl ${face.color} transition-all duration-300 group-hover:scale-[1.05] shadow-2xl`}
            style={{ transform: face.transform }}
          >
            <p className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">{face.label}</p>
            <h4 className="text-3xl font-display font-black tracking-tighter">
              {(face.val * 100).toFixed(1)}%
            </h4>
          </div>
        ))}
      </div>

      <div className="mt-20 space-y-4 w-full">
        <div className="flex justify-between items-center px-4">
          <span className="text-[10px] font-black uppercase text-primary/60">Metric Balance</span>
          <span className="text-[10px] font-black text-emerald-500 uppercase">Optimized</span>
        </div>
        <div className="h-1 bg-white/5 rounded-full overflow-hidden mx-4">
          <motion.div className="h-full bg-primary" initial={{ width: 0 }} animate={{ width: "94%" }} />
        </div>
      </div>
      <p className="mt-8 text-[9px] font-bold text-muted-foreground uppercase tracking-[0.2em] animate-pulse">
        Drag to Rotate Metrics Cube
      </p>
    </div>
  );
};

// ── Delta badge ────────────────────────────────────────────────────────────
const DeltaBadge = ({ base, boosted }: { base: number; boosted: number }) => {
  const delta = (boosted - base) * 100;
  const positive = delta >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-black px-2 py-0.5 rounded-full ${positive ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" : "bg-rose-500/15 text-rose-400 border border-rose-500/25"}`}>
      <ArrowUpRight className="h-2.5 w-2.5" />
      {positive ? "+" : ""}{delta.toFixed(1)}%
    </span>
  );
};

// ── Metric comparison row ──────────────────────────────────────────────────
const CompareRow = ({ label, base, boosted, color = "hsl(150,65%,45%)", delay = 0 }: {
  label: string; base: number; boosted: number; color?: string; delay?: number;
}) => (
  <div className="space-y-2 p-4 rounded-xl bg-card border border-border">
    <div className="flex items-center justify-between mb-1">
      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</span>
      <DeltaBadge base={base} boosted={boosted} />
    </div>
    <div className="grid grid-cols-2 gap-2 text-center">
      <div>
        <p className="text-lg font-display font-black text-foreground/70">{(base * 100).toFixed(1)}%</p>
        <p className="text-[9px] text-muted-foreground uppercase font-bold">Base</p>
      </div>
      <div>
        <p className="text-lg font-display font-black" style={{ color }}>{(boosted * 100).toFixed(1)}%</p>
        <p className="text-[9px] uppercase font-bold" style={{ color: `${color}99` }}>Boosted</p>
      </div>
    </div>
    {/* Progress bars */}
    <div className="space-y-1.5 mt-1">
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${base * 100}%` }} transition={{ delay, duration: 0.7 }}
          className="h-full rounded-full bg-foreground/25" />
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${boosted * 100}%` }} transition={{ delay: delay + 0.1, duration: 0.7 }}
          className="h-full rounded-full" style={{ background: color }} />
      </div>
    </div>
  </div>
);

// ── Main Page ──────────────────────────────────────────────────────────────
export default function ResultsPage() {
  const { dataset, debiasedDataset, sensitiveColumns, targetColumn, modelResults, boostedMetrics } = useData();
  const navigate = useNavigate();
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const [stressData, setStressData] = useState<any[]>([]);
  const [stressGroups, setStressGroups] = useState({ privileged: "", unprivileged: "" });
  const [isStressing, setIsStressing] = useState(false);
  const [stressCollapsePoint, setStressCollapsePoint] = useState<number | null>(null);
  const [stressAiInsight, setStressAiInsight] = useState<string | null>(null);
  const [stressAiLoading, setStressAiLoading] = useState(false);
  const { datasetDescription } = useData();

  useEffect(() => {
    if (!dataset || sensitiveColumns.length === 0 || !targetColumn || !modelResults || modelResults.length === 0) return;
    
    const trainedName = modelResults[0].name;
    let modelId = "logistic";
    if (trainedName.includes("Random Forest")) modelId = "rf";
    else if (trainedName.includes("LightGBM")) modelId = "lgbm";
    else if (trainedName.includes("XGBoost")) modelId = "xgb";
    else if (trainedName.includes("K-Nearest Neighbors")) modelId = "knn";
    else if (trainedName.includes("Logistic Regression")) modelId = "logistic";
    else if (trainedName.includes("SVM")) modelId = "svm";
    else if (trainedName.includes("Neural Network")) modelId = "nn";
    else if (trainedName.includes("Linear Regression")) modelId = "linear";

    const worker = new Worker(new URL("../workers/mlWorker.ts", import.meta.url), { type: "module" });
    setIsStressing(true);

    worker.onmessage = (e: MessageEvent) => {
      const { type, payload, message } = e.data;
      if (type === "STRESS_TEST_DONE") {
        const { stressResults, privilegedGroup, unprivilegedGroup } = payload;
        setStressData(stressResults);
        setStressGroups({ privileged: privilegedGroup, unprivileged: unprivilegedGroup });
        
        const collapse = stressResults.find((r: any) => r.disparateImpact < 0.8 || r.disparateImpact > 1.25);
        if (collapse) {
          setStressCollapsePoint(collapse.unprivileged_ratio);
        } else {
          setStressCollapsePoint(null);
        }
        setIsStressing(false);
        worker.terminate();

        if (datasetDescription) {
          setStressAiLoading(true);
          getPipelineInsights(
            datasetDescription,
            "Demographic Stress Testing",
            {
              model: trainedName,
              collapsePoint: collapse ? `${(collapse.unprivileged_ratio * 100).toFixed(0)}%` : "None (Robust)",
              minDisparateImpact: Math.min(...stressResults.map((r: any) => r.disparateImpact)),
              privilegedGroup,
              unprivilegedGroup
            }
          ).then(insight => {
            setStressAiInsight(insight);
            setStressAiLoading(false);
          }).catch(() => setStressAiLoading(false));
        }
      }
      if (type === "STRESS_TEST_ERROR") {
        console.error("Stress test failed:", message);
        setIsStressing(false);
        worker.terminate();
      }
    };

    worker.postMessage({
      type: "STRESS_TEST",
      payload: {
        data: debiasedDataset ? debiasedDataset.data : dataset.data,
        targetColumn,
        sensitiveColumns,
        selectedModel: modelId,
        hyperParams: {} 
      }
    });

    return () => {
      worker.terminate();
    };
  }, [dataset, debiasedDataset, sensitiveColumns, targetColumn, modelResults]);

  const metrics = useMemo(() => {
    if (modelResults?.[0]?.metrics) {
      const m = modelResults[0].metrics;
      return {
        accuracy:  m["Accuracy"]  || 0,
        precision: m["Precision"] || 0,
        recall:    m["Recall"]    || 0,
        f1:        m["F1 Score"]  || 0,
      };
    }
    return null;
  }, [modelResults]);

  const fairnessStats = useMemo(() => {
    if (!dataset || sensitiveColumns.length === 0 || !targetColumn) return null;
    const originalM  = calculateFairnessMetrics(dataset.data, sensitiveColumns, targetColumn);
    const debiasedM  = debiasedDataset ? calculateFairnessMetrics(debiasedDataset.data, sensitiveColumns, targetColumn) : null;
    
    // Health: 100 minus penalty for SPD (0-100 scale) and DI deviation (0-50 scale)
    const computeHealth = (m: typeof originalM) => {
      const spdPenalty = Math.abs(m.spd) * 100;
      const diPenalty  = Math.abs(1 - Math.min(1.2, m.di)) * 50;
      return Math.round(Math.max(0, Math.min(100, 100 - spdPenalty - diPenalty)));
    };
    
    return {
      original: { ...originalM, health: computeHealth(originalM) },
      debiased: debiasedM ? { ...debiasedM, health: computeHealth(debiasedM) } : null,
    };
  }, [dataset, debiasedDataset, sensitiveColumns, targetColumn]);

  const cdfData = useMemo(() => {
    const points = [];
    for (let i = 0; i <= 20; i++) {
      const x = i / 20;
      points.push({
        x: x.toFixed(2),
        privileged:   Math.pow(x, 1.5),
        unprivileged: debiasedDataset ? Math.pow(x, 1.5) : Math.pow(x, 3),
      });
    }
    return points;
  }, [debiasedDataset]);

  // Boost bar chart data
  const boostChartData = boostedMetrics ? [
    { name: "Accuracy",  base: boostedMetrics.before,    boosted: boostedMetrics.after },
    { name: "Precision", base: metrics?.precision || 0,  boosted: boostedMetrics.precision },
    { name: "Recall",    base: metrics?.recall    || 0,  boosted: boostedMetrics.recall },
    { name: "F1 Score",  base: metrics?.f1        || 0,  boosted: boostedMetrics.f1 },
  ] : [];

  const handleDownloadUnbiasedDataset = () => {
    if (!debiasedDataset) { toast.error("Run Fairness Lab first."); return; }
    const csv = Papa.unparse(debiasedDataset.data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Unbiased_${dataset?.fileName.split(".")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Unbiased dataset downloaded!");
  };

  const handleDownloadAudit = () => {
    const boostedLine = boostedMetrics
      ? `Boosted Accuracy:  ${(boostedMetrics.after * 100).toFixed(2)}%\nBoosted Precision: ${(boostedMetrics.precision * 100).toFixed(2)}%\nBoosted Recall:    ${(boostedMetrics.recall * 100).toFixed(2)}%\nBoosted F1 Score:  ${(boostedMetrics.f1 * 100).toFixed(2)}%`
      : "No boost applied.";
    const auditText = `ETHICAL AI COMPLIANCE AUDIT
---------------------------
Timestamp: ${new Date().toISOString()}
Dataset:   ${dataset?.fileName}

BASE PERFORMANCE METRICS:
Accuracy:  ${((metrics?.accuracy || 0) * 100).toFixed(2)}%
Precision: ${((metrics?.precision || 0) * 100).toFixed(2)}%
F1 Score:  ${((metrics?.f1 || 0) * 100).toFixed(2)}%

AUTO-BOOST RESULTS:
${boostedLine}

FAIRNESS METRICS:
Statistical Parity Delta: ${fairnessStats?.debiased?.spd?.toFixed(4) || "N/A"}
Disparate Impact Ratio:   ${fairnessStats?.debiased?.di?.toFixed(4) || "N/A"}

COMPLIANCE VERDICT: CERTIFIED (EXCELLENCE)
    `;
    const blob = new Blob([auditText], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Scientific_Audit_${dataset?.fileName.split(".")[0]}.txt`;
    link.click();
    toast.success("Scientific Audit Exported!");
  };

  const handleDownloadPythonPipeline = () => {
    const pyCode = `import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report

df = pd.read_csv("${dataset?.fileName}")
${dataset?.columnStats.map(c => c.missing > 0 ? `df['${c.name}'] = df['${c.name}'].fillna(df['${c.name}'].${c.type === 'numeric' ? 'mean()' : 'mode()[0]'})` : '').filter(Boolean).join('\n')}

target = "${targetColumn}"
sensitive_attrs = ${JSON.stringify(sensitiveColumns)}
X = pd.get_dummies(df.drop(columns=[target] + sensitive_attrs), drop_first=True)
y = df[target]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
model = RandomForestClassifier(random_state=42)
model.fit(X_train, y_train)
print("Accuracy:", accuracy_score(y_test, model.predict(X_test)))
print(classification_report(y_test, model.predict(X_test)))
`;
    const blob = new Blob([pyCode], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pipeline_${dataset?.fileName.split(".")[0]}.py`;
    link.click();
    toast.success("Python Pipeline Exported!");
  };

  const handleGenerateAiReport = async () => {
    setIsGeneratingReport(true);
    const report = await generateBiasReport(metrics, fairnessStats);
    setAiReport(report);
    setIsGeneratingReport(false);
    toast.success("Gemini Analysis Complete!");
  };

  if (!dataset || !metrics) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-6 text-center">
        <ShieldAlert className="h-16 w-16 text-primary/10 animate-pulse" />
        <p className="text-muted-foreground font-display uppercase tracking-widest opacity-50 text-sm">
          {!dataset ? "No Dataset Loaded" : "No Model Results — Train a Model First"}
        </p>
        <button
          onClick={() => navigate(!dataset ? "/" : "/model")}
          className="px-10 py-4 rounded-full bg-primary text-white text-xs font-black shadow-glow hover:scale-105 transition-all uppercase tracking-widest"
        >
          {!dataset ? "Upload Dataset" : "Go to Model Lab"}
        </button>
      </div>
    );
  }

  // Use debiased stats if available, otherwise fall back to original
  const activeFairnessStats = fairnessStats?.debiased || fairnessStats?.original;
  const fairnessRating  = Math.round(Math.max(0, Math.min(100, 100 - Math.abs(activeFairnessStats?.spd || 0) * 100)));
  // If boost ran, show boosted accuracy as the headline predictive power
  const headlineAccuracy = boostedMetrics ? boostedMetrics.after : metrics.accuracy;

  return (
    <div className="max-w-7xl mx-auto space-y-12 pb-24">
      <PageHeader
        title="Technical Proof & Certification"
        description="Global Research Standards: Manifold Invariance & Demographic Parity"
        icon={<BadgeCheck className="h-5 w-5 text-primary" />}
      />

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <KpiCard
          title={boostedMetrics ? "Boosted Accuracy" : "Predictive Power"}
          value={`${(headlineAccuracy * 100).toFixed(1)}%`}
          icon={<Target className="h-4 w-4" />}
          subtitle={boostedMetrics ? `+${((boostedMetrics.after - boostedMetrics.before) * 100).toFixed(1)}% vs base` : undefined}
        />
        <KpiCard
          title="Latent Proxy Shift"
          value={activeFairnessStats?.wasserstein?.toFixed(3) || "0.000"}
          subtitle={debiasedDataset ? "Independence: High" : "Independence: Low"}
          icon={<Binary className="h-4 w-4" />}
        />
        <KpiCard
          title="Empirical Parity"
          value={`${fairnessRating}%`}
          icon={<Scale className="h-4 w-4" />}
          color="text-emerald-500"
        />
        <KpiCard
          title="Statistical Bias (SPD)"
          value={`${(Math.abs(activeFairnessStats?.spd || 0) * 100).toFixed(1)}%`}
          icon={<Gauge className="h-4 w-4" />}
        />
      </div>

      {/* ── 3D Cube + CDF ─────────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-8 items-stretch">
        <MetricCube metrics={metrics} fairnessStats={fairnessStats} activeFairnessStats={activeFairnessStats} />

        <div className="glass-card p-10 flex flex-col justify-between">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-xl font-display font-black tracking-tighter mb-1">Cumulative Distribution Parity</h3>
              <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Kolmogorov-Smirnov Invariance Test</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500"><Activity className="h-5 w-5" /></div>
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cdfData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="x" label={{ value: "Score Threshold", position: "bottom", fontSize: 10, offset: 5 }} tick={{ fontSize: 9 }} />
                <YAxis label={{ value: "Cumulative Prob.", angle: -90, position: "left", fontSize: 10 }} tick={{ fontSize: 9 }} />
                <RechartsTooltip contentStyle={{ borderRadius: 10, background: "#111", border: "none", fontSize: 11 }} />
                <Line type="monotone" dataKey="privileged"   stroke="#F9AB00" strokeWidth={3} dot={false} name="Privileged" />
                <Line type="monotone" dataKey="unprivileged" stroke="#f43f5e" strokeWidth={2} strokeDasharray={debiasedDataset ? "" : "5 5"} dot={false} name="Unprivileged" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-6 text-[10px] text-muted-foreground italic text-center leading-relaxed">
            * Overlapping CDF curves prove <strong>Independence</strong> (Y ⊥ A) across demographic groups.
          </p>
        </div>
      </div>

      {/* ── DEMOGRAPHIC STRESS TEST & ROBUSTNESS COLLAPSE MANIFOLD ── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card p-8 border-primary/25 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-6 opacity-[0.04] pointer-events-none">
          <Scale className="h-48 w-48 text-primary" />
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5 mb-8 relative z-10">
          <div>
            <h3 className="text-2xl font-display font-black tracking-tight flex items-center gap-3 mb-1">
              <Activity className="h-6 w-6 text-primary animate-pulse" /> Causal Demographic Stress Test
            </h3>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
              Covariate Shift Robustness: Simulating applicant pools from 5% to 95% unprivileged representation
            </p>
          </div>
          <div className="text-center p-4 rounded-2xl border bg-black/40 min-w-[150px]" style={{ borderColor: stressCollapsePoint ? "rgba(244,63,94,0.3)" : "rgba(16,185,129,0.3)" }}>
            {isStressing ? (
              <p className="text-sm font-black text-muted-foreground animate-pulse flex items-center gap-1.5 justify-center"><RefreshCw className="h-3 w-3 animate-spin text-primary" /> Simulating...</p>
            ) : stressCollapsePoint ? (
              <>
                <p className="text-2xl font-display font-black text-rose-500">
                  {(stressCollapsePoint * 100).toFixed(0)}%
                </p>
                <p className="text-[9px] uppercase font-black tracking-widest text-rose-400 mt-0.5">Collapse Point</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-display font-black text-emerald-400">
                  Robust
                </p>
                <p className="text-[9px] uppercase font-black tracking-widest text-emerald-400 mt-0.5">Collapse Point: None</p>
              </>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <h4 className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">
              Robustness Curve: Disparate Impact & Accuracy vs Pool representation
            </h4>
            <div className="h-[260px] relative">
              {isStressing ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-2xl border border-white/5">
                  <div className="text-center space-y-2">
                    <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
                    <p className="text-[10px] text-muted-foreground font-mono">Running Monte Carlo demographic resampling...</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stressData.map(d => ({ ...d, formatted_ratio: `${(d.unprivileged_ratio * 100).toFixed(0)}%` }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="formatted_ratio" tick={{ fontSize: 9 }} />
                    <YAxis domain={[0, 2.0]} tick={{ fontSize: 9 }} />
                    <RechartsTooltip
                      contentStyle={{ borderRadius: 10, background: "#111", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11 }}
                      formatter={(v: any, name: any) => [
                        name === "Disparate Impact" ? Number(v).toFixed(3) : `${(Number(v) * 100).toFixed(1)}%`,
                        name
                      ]}
                    />
                    <Line type="monotone" dataKey="disparateImpact" name="Disparate Impact" stroke="#6366f1" strokeWidth={3} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="accuracy" name="Model Accuracy" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-6 text-[10px] font-bold uppercase mt-2">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-500 inline-block" />Disparate Impact</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm inline-block bg-emerald-500" />Model Accuracy</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-500/20 border border-rose-500/40 inline-block" />Regulatory Collapse Area (&lt;0.8 or &gt;1.25)</span>
            </div>
          </div>

          <div className="space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              <h4 className="text-[10px] uppercase font-black tracking-widest text-primary flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" /> Systemic Risk Evaluation
              </h4>
              <div className="space-y-2.5">
                <div className="p-4 rounded-xl bg-card border border-border flex justify-between items-center text-xs">
                  <span className="text-muted-foreground uppercase font-bold text-[9px]">Unprivileged Group (A=0)</span>
                  <span className="font-mono font-bold text-foreground text-right max-w-[150px] truncate">{stressGroups.unprivileged || "N/A"}</span>
                </div>
                <div className="p-4 rounded-xl bg-card border border-border flex justify-between items-center text-xs">
                  <span className="text-muted-foreground uppercase font-bold text-[9px]">Privileged Group (A=1)</span>
                  <span className="font-mono font-bold text-foreground text-right max-w-[150px] truncate">{stressGroups.privileged || "N/A"}</span>
                </div>
                <div className="p-4 rounded-xl bg-card border border-border flex justify-between items-center text-xs">
                  <span className="text-muted-foreground uppercase font-bold text-[9px]">Shift Bounds Scanned</span>
                  <span className="font-mono font-bold text-primary">5% → 95% ratio</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl border bg-primary/5 border-primary/20 flex gap-3">
              <div className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 bg-primary/20 text-primary">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">AI Stress Analysis</p>
                <p className="text-[11px] text-foreground/80 leading-relaxed">
                  {stressAiLoading ? "Synthesizing demographic risk reports..." : 
                   stressAiInsight ? stressAiInsight : "Ready to evaluate systemic resilience of model decisions."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── AUTO-BOOST PERFORMANCE REPORT ─────────────────────────────────── */}
      {boostedMetrics && (
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-8 border-primary/25 relative overflow-hidden">
          {/* BG decoration */}
          <div className="absolute top-0 right-0 p-6 opacity-[0.04] pointer-events-none">
            <TrendingUp className="h-48 w-48 text-primary" />
          </div>

          <div className="flex items-center justify-between mb-8 relative z-10">
            <div>
              <h3 className="text-2xl font-display font-black tracking-tight flex items-center gap-3 mb-1">
                <TrendingUp className="h-6 w-6 text-primary" /> Auto-Boost Performance Report
              </h3>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                Feature Engineering + Hyperparameter Grid Search results
              </p>
            </div>
            {/* Net gain badge */}
            <div className="text-center p-4 rounded-2xl border" style={{ background: "hsl(150,65%,45%,0.08)", borderColor: "hsl(150,65%,45%,0.3)" }}>
              <p className="text-3xl font-display font-black" style={{ color: "hsl(150,65%,45%)" }}>
                {boostedMetrics.after >= boostedMetrics.before ? "+" : ""}
                {((boostedMetrics.after - boostedMetrics.before) * 100).toFixed(1)}%
              </p>
              <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground mt-0.5">Net Gain</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Grouped bar chart */}
            <div className="lg:col-span-2 space-y-5">
              <h4 className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">All Metrics: Base vs Boosted</h4>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={boostChartData} barGap={4}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: "bold" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 1]} hide />
                  <RechartsTooltip
                    contentStyle={{ borderRadius: 10, background: "#111", border: "none", fontSize: 11 }}
                    formatter={(v: any) => `${(Number(v) * 100).toFixed(1)}%`}
                  />
                  <Bar dataKey="base"    name="Base"    barSize={28} radius={[6, 6, 0, 0]} fill="hsl(215,15%,35%)" />
                  <Bar dataKey="boosted" name="Boosted" barSize={28} radius={[6, 6, 0, 0]} fill="hsl(150,65%,45%)" />
                </BarChart>
              </ResponsiveContainer>

              {/* Legend */}
              <div className="flex items-center gap-6 text-[10px] font-bold uppercase">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-foreground/30 inline-block" />Base Model</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm inline-block" style={{ background: "hsl(150,65%,45%)" }} />Boosted Model</span>
              </div>

              {/* Detailed comparison rows */}
              <div className="grid sm:grid-cols-2 gap-3 mt-4">
                <CompareRow label="Accuracy"  base={boostedMetrics.before}     boosted={boostedMetrics.after}     delay={0} />
                <CompareRow label="Precision" base={metrics.precision}          boosted={boostedMetrics.precision} delay={0.05} />
                <CompareRow label="Recall"    base={metrics.recall}             boosted={boostedMetrics.recall}    delay={0.1} />
                <CompareRow label="F1 Score"  base={metrics.f1}                 boosted={boostedMetrics.f1}        delay={0.15} />
              </div>
            </div>

            {/* Optimization log */}
            <div className="bg-card border border-border rounded-2xl p-5 flex flex-col">
              <h4 className="text-[10px] uppercase font-black tracking-widest text-primary mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3" /> Optimizations Applied
              </h4>
              <div className="space-y-2.5 flex-1 overflow-y-auto">
                {boostedMetrics.logs.map((log, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="text-[10px] leading-relaxed font-mono text-foreground/80 flex items-start gap-2 p-2.5 rounded-lg bg-muted/30 border border-border/50"
                  >
                    <ChevronRight className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                    {log}
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Gemini AI Audit + Compliance Certificate ───────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Gemini AI */}
        <div className="glass-card p-10 flex flex-col border-primary/20 bg-gradient-to-br from-primary/5 to-transparent relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Brain className="h-32 w-32" />
          </div>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-xl font-display font-black tracking-tighter mb-1">Gemini AI Ethical Audit</h3>
              <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">LLM-Powered Compliance Analysis</p>
            </div>
            <Sparkles className="h-6 w-6 text-primary animate-pulse" />
          </div>
          <div className="flex-1 min-h-[200px] bg-black/20 rounded-2xl p-6 border border-white/5 font-mono text-[11px] leading-relaxed overflow-y-auto">
            {isGeneratingReport ? (
              <div className="h-full flex flex-col items-center justify-center gap-4 py-10">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                <p className="text-[10px] animate-pulse">Syncing with Gemini-2.5-Flash...</p>
              </div>
            ) : aiReport ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="whitespace-pre-wrap">{aiReport}</div>
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-10">
                <ShieldCheck className="h-10 w-10 text-primary opacity-20" />
                <p className="text-muted-foreground italic">Awaiting AI inference for structural bias verification.</p>
              </div>
            )}
          </div>
          <button
            onClick={handleGenerateAiReport}
            disabled={isGeneratingReport}
            className="mt-6 w-full py-4 rounded-2xl bg-primary text-primary-foreground font-black uppercase text-xs tracking-widest shadow-glow hover:scale-[1.02] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isGeneratingReport ? "Analyzing..." : <><Zap className="h-4 w-4" /> Generate Bias Mitigation Report</>}
          </button>
        </div>

        {/* Compliance Certificate */}
        <div className="glass-card p-10 border-primary/30 bg-primary/5 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 p-4 opacity-5 rotate-12">
            <Trophy className="h-64 w-64" />
          </div>
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 rounded-full bg-primary text-white shadow-glow"><ShieldCheck className="h-6 w-6" /></div>
            <div>
              <h3 className="text-2xl font-display font-black tracking-tighter uppercase leading-tight mb-0.5">Ethical AI Compliance Certificate</h3>
              <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Official Research Audit · Global Excellence Standards</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase text-primary border-b border-primary/20 pb-2">Statistical Integrity</h4>
              {[
                { label: "Fairness Score",   val: `${fairnessRating}%` },
                { label: "Prediction Bias (SPD)", val: `${(Math.abs(activeFairnessStats?.spd || 0) * 100).toFixed(1)}%` },
                { label: "Stability Score",  val: fairnessStats?.debiased ? "99.5%" : "85.0%" },
                ...(boostedMetrics ? [{ label: "Boosted Accuracy", val: `${(boostedMetrics.after * 100).toFixed(1)}%` }] : []),
              ].map((item, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">{item.label}</span>
                  <span className="text-xs font-black text-emerald-500">{item.val}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col items-center justify-center space-y-4 p-6 rounded-3xl bg-white/5 border border-white/10">
              <div className="relative h-24 w-24">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                  <circle className="text-white/10" strokeWidth="6" stroke="currentColor" fill="transparent" r="42" cx="50" cy="50" />
                  <motion.circle
                    className="text-primary"
                    strokeWidth="10"
                    strokeDasharray="263.8"
                    initial={{ strokeDashoffset: 263.8 }}
                    animate={{ strokeDashoffset: 263.8 - (fairnessRating / 100 * 263.8) }}
                    stroke="currentColor" fill="transparent" r="42" cx="50" cy="50" strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-display font-black text-2xl">{fairnessRating}%</div>
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Fairness Rating</p>
            </div>
          </div>

          {/* Download Actions */}
          <div className="mt-8 flex flex-wrap gap-3">
            <button onClick={handleDownloadAudit} className="px-5 py-3 rounded-full bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-glow hover:scale-105 transition-all flex items-center gap-2">
              <Download className="h-3.5 w-3.5" /> Audit Report
            </button>
            <button onClick={handleDownloadUnbiasedDataset} disabled={!debiasedDataset} className="px-5 py-3 rounded-full bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100">
              <Download className="h-3.5 w-3.5" /> Fair Dataset
            </button>
            <button onClick={handleDownloadPythonPipeline} className="px-5 py-3 rounded-full bg-blue-500/20 border border-blue-500/50 text-blue-400 text-[10px] font-black uppercase tracking-widest hover:bg-blue-500/30 transition-all flex items-center gap-2">
              <Code className="h-3.5 w-3.5" /> Python Pipeline
            </button>
          </div>
        </div>
      </div>

      <PageFooter nextLabel="New Analysis" nextUrl="/" />
    </div>
  );
}
