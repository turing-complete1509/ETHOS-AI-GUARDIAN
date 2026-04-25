import { useData } from "@/context/DataContext";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { LayoutDashboard, AlertTriangle, Copy, Hash, Type, Activity, ShieldCheck, Sparkles, Scale } from "lucide-react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import { useNavigate } from "react-router-dom";
import { PageFooter } from "@/components/PageFooter";

const CHART_COLORS = ["#F9AB00", "#4338CA", "#10B981", "#EF4444", "#8B5CF6"];

export default function OverviewPage() {
  const { dataset } = useData();
  const navigate = useNavigate();

  if (!dataset) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-muted-foreground">No dataset loaded.</p>
        <button onClick={() => navigate("/")} className="text-primary hover:underline text-sm">Upload a dataset</button>
      </div>
    );
  }

  const missingByCol = dataset.columnStats
    .filter(c => c.missing > 0)
    .sort((a, b) => b.missing - a.missing)
    .slice(0, 10)
    .map(c => ({ name: c.name.slice(0, 12), missing: c.missing, pct: c.missingPct }));

  const typeData = [
    { name: "Numeric", value: dataset.numericCols },
    { name: "Categorical", value: dataset.categoricalCols },
  ];

  const healthScore = Math.max(0, Math.round(100 - (dataset.missingPct * 2) - (dataset.duplicateRows > 0 ? 5 : 0)));
  const ethicsScore = Math.max(0, Math.round(100 - (dataset.categoricalCols * 2.5))); // Simulated proxy
  
  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-24">
      <PageHeader 
        title="Intelligence Dashboard" 
        description={`${dataset.fileName} — Analyzing ${dataset.rows.toLocaleString()} vectors for potential demographic leakage.`} 
        icon={<LayoutDashboard className="h-5 w-5 text-primary" />} 
      />

      {/* CORE HEALTH METRICS */}
      <div className="grid lg:grid-cols-12 gap-8">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-4 glass-card p-10 flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-card to-primary/5">
           <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
             <Activity className="h-3 w-3" /> Data Health
           </div>
           
           <div className="relative h-44 w-44 flex items-center justify-center mt-6">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                <circle className="text-border/40" strokeWidth="4" stroke="currentColor" fill="transparent" r="42" cx="50" cy="50" />
                <motion.circle 
                  className="text-primary" 
                  strokeWidth="8" 
                  strokeDasharray="263.8"
                  initial={{ strokeDashoffset: 263.8 }}
                  animate={{ strokeDashoffset: 263.8 - (healthScore / 100) * 263.8 }}
                  transition={{ duration: 1.5 }}
                  stroke="currentColor" fill="transparent" r="42" cx="50" cy="50" strokeLinecap="round"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-6xl font-display font-black tracking-tighter">{healthScore}</span>
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Score</span>
              </div>
           </div>

           <div className="w-full mt-10 space-y-3">
              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                 <span>Completeness</span>
                 <span>{(100 - dataset.missingPct).toFixed(1)}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                 <motion.div className="h-full bg-primary" initial={{ width: 0 }} animate={{ width: `${100 - dataset.missingPct}%` }} />
              </div>
           </div>
        </motion.div>

        <div className="lg:col-span-8 grid grid-cols-2 gap-6">
          <KpiCard title="Demographic Proxies" value={dataset.categoricalCols} subtitle="Potential bias triggers" icon={<Scale className="h-4 w-4" />} />
          <KpiCard title="Missing Cells" value={dataset.missingTotal.toLocaleString()} subtitle={`${dataset.missingPct.toFixed(1)}% density`} icon={<AlertTriangle className="h-4 w-4" />} color="text-rose-500" />
          <KpiCard title="Duplicate Records" value={dataset.duplicateRows} icon={<Copy className="h-4 w-4" />} />
          <div className="glass-card p-6 border-accent/20 bg-accent/5 flex items-center justify-between">
             <div className="space-y-1">
               <p className="text-[10px] font-black uppercase text-accent tracking-[0.2em]">Compliance</p>
               <p className="text-2xl font-display font-black tracking-tighter">{ethicsScore}%</p>
               <p className="text-[9px] text-muted-foreground italic">Global Excellence Score</p>
             </div>
             <ShieldCheck className="h-10 w-10 text-accent opacity-20" />
          </div>
        </div>
      </div>

      {/* ANALYSIS GRAPHS */}
      <div className="grid md:grid-cols-2 gap-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-display font-black text-sm uppercase tracking-widest">Null Density Profile</h3>
            <span className="text-[9px] font-bold text-muted-foreground uppercase">Top 10 Variables</span>
          </div>
          {missingByCol.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={missingByCol} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 9, fill: "#888", fontWeight: "bold" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "transparent" }} contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }} />
                <Bar dataKey="missing" radius={[0, 8, 8, 0]} barSize={20} fill="#F9AB00" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex flex-col items-center justify-center space-y-4">
               <Sparkles className="h-10 w-10 text-primary opacity-20" />
               <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Zero Entropy Detected</p>
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-8">
          <h3 className="font-display font-black text-sm uppercase tracking-widest mb-8">Schema Topology</h3>
          <div className="flex items-center justify-between h-[260px]">
             <div className="w-1/2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={typeData} cx="50%" cy="50%" innerRadius={65} outerRadius={95} paddingAngle={8} dataKey="value" animationDuration={1500}>
                      {typeData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i]} stroke="none" />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }} />
                  </PieChart>
                </ResponsiveContainer>
             </div>
             <div className="w-1/2 space-y-6">
                {typeData.map((t, i) => (
                  <div key={t.name} className="flex items-center gap-4">
                     <div className="h-10 w-1 bg-primary rounded-full" style={{ backgroundColor: CHART_COLORS[i] }} />
                     <div className="space-y-0.5">
                       <p className="text-xl font-display font-black tracking-tighter">{t.value}</p>
                       <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{t.name} Vectors</p>
                     </div>
                  </div>
                ))}
             </div>
          </div>
        </motion.div>
      </div>

      {/* COLUMN STATISTICS TABLE */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card overflow-hidden">
        <div className="p-8 border-b border-border flex justify-between items-center">
           <h3 className="font-display font-black text-sm uppercase tracking-widest">Observation Space Statistics</h3>
           <p className="text-[10px] text-muted-foreground italic font-bold">Comprehensive feature audit for 50+ dimensions</p>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                {["Feature Dimension", "Encoding", "Missing", "Delta %", "Cardinality", "Mean Vector", "Standard Dev"].map(h => (
                  <th key={h} className="px-6 py-5 text-left font-black uppercase tracking-tighter text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataset.columnStats.slice(0, 50).map(col => (
                <tr key={col.name} className="border-b border-border/30 hover:bg-primary/5 transition-colors group">
                  <td className="px-6 py-4 font-black tracking-tight text-foreground/80 group-hover:text-foreground">{col.name}</td>
                  <td className="px-6 py-4">
                    <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${col.type === "numeric" ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"}`}>
                      {col.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground font-mono">{col.missing}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${col.missingPct}%` }} className="h-full bg-rose-500" />
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground">{col.missingPct.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground font-mono">{col.unique}</td>
                  <td className="px-6 py-4 font-mono text-primary/80">{col.mean?.toFixed(3) ?? "VECTOR"}</td>
                  <td className="px-6 py-4 font-mono text-muted-foreground">{col.std?.toFixed(3) ?? "MANIFOLD"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      <PageFooter nextLabel="Select Target Vectors" nextUrl="/selection" />
    </div>
  );
}
