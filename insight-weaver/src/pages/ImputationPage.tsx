import { useData } from "@/context/DataContext";
import { PageHeader } from "@/components/PageHeader";
import { Beaker, Check, Sparkles, Wand2 } from "lucide-react";
import { motion, animate, useMotionValue, useTransform } from "framer-motion";
import { useState, useMemo, useEffect } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useNavigate } from "react-router-dom";
import { PageFooter } from "@/components/PageFooter";

import { toast } from "sonner";

const TECHNIQUES = [
  "Mean", "Median", "Mode", "Forward Fill", "Backward Fill",
  "Regression", "Random Forest", "Bayesian", "PMM", "MICE", "Transformer-based", "Interpolation", "Hot/Cold Deck"
];

export default function ImputationPage() {
  const { dataset } = useData();
  const navigate = useNavigate();
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [technique, setTechnique] = useState("Mean");
  const [applied, setApplied] = useState<{ col: string; technique: string }[]>([]);
  const [isAiSuggesting, setIsAiSuggesting] = useState(false);

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
    if (!selectedCols.length) return;
    setApplied(prev => {
      const newApplied = [...prev];
      selectedCols.forEach(col => {
        if (!newApplied.find(a => a.col === col)) newApplied.push({ col, technique });
      });
      return newApplied;
    });
    setSelectedCols([]);
    setIsAiSuggesting(false);
  };

  const handleAiSuggest = () => {
    setIsAiSuggesting(true);
    setSelectedCols(missingCols.map(c => c.name));
    setTechnique("Transformer-based");
    toast.success("AI suggested Transformer-based imputation for all columns.");
  };

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
        </motion.div>
      </div>

      {beforeAfterData.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="glass-card p-5 mt-6">
          <h3 className="font-display font-semibold text-sm mb-4">Null Distribution Before vs After</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={beforeAfterData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorBefore" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(0,80%,50%)" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="hsl(0,80%,50%)" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorAfter" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(190,90%,50%)" stopOpacity={0.6}/>
                  <stop offset="95%" stopColor="hsl(190,90%,50%)" stopOpacity={0}/>
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
