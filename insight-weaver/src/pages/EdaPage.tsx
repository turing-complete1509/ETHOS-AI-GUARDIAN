import { useData } from "@/context/DataContext";
import { PageHeader } from "@/components/PageHeader";
import { BarChart3 } from "lucide-react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ScatterChart, Scatter, CartesianGrid, LineChart, Line, Cell } from "recharts";
import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageFooter } from "@/components/PageFooter";

export default function EdaPage() {
  const { dataset } = useData();
  const navigate = useNavigate();
  const [selectedCol, setSelectedCol] = useState<string>("");
  const [scatterX, setScatterX] = useState<string>("");
  const [scatterY, setScatterY] = useState<string>("");

  const numericCols = useMemo(() => dataset?.columnStats.filter(c => c.type === "numeric").map(c => c.name) ?? [], [dataset]);
  const catCols = useMemo(() => dataset?.columnStats.filter(c => c.type !== "numeric").map(c => c.name) ?? [], [dataset]);

  // Auto-select first numeric column for immediate visualization
  useEffect(() => {
    if (numericCols.length > 0 && !selectedCol) {
      setSelectedCol(numericCols[0]);
    }
    if (numericCols.length >= 2 && !scatterX && !scatterY) {
      setScatterX(numericCols[0]);
      setScatterY(numericCols[1]);
    }
  }, [numericCols, selectedCol, scatterX, scatterY]);

  const chartData = useMemo(() => {
    if (!dataset || !selectedCol) return { type: "none", data: [] };
    const col = dataset.columnStats.find(c => c.name === selectedCol);
    if (!col) return { type: "none", data: [] };

    if (col.type === "numeric") {
      const vals = dataset.data.map(r => Number(r[selectedCol])).filter(v => !isNaN(v));
      if (!vals.length) return { type: "none", data: [] };
      let min = Infinity, max = -Infinity;
      for (let k = 0; k < vals.length; k++) {
        if (vals[k] < min) min = vals[k];
        if (vals[k] > max) max = vals[k];
      }
      const bins = 20;
      const binWidth = (max - min) / bins || 1;
      const counts = Array(bins).fill(0);
      vals.forEach(v => { const i = Math.min(Math.floor((v - min) / binWidth), bins - 1); counts[i]++; });
      return { 
        type: "numeric", 
        data: counts.map((count, i) => ({ label: (min + i * binWidth).toFixed(1), value: count }))
      };
    } else {
      // Categorical data - use topValues from stats
      return {
        type: "categorical",
        data: col.topValues?.map(v => ({ label: v.value, value: v.count })) || []
      };
    }
  }, [dataset, selectedCol]);

  const correlationData = useMemo(() => {
    if (!dataset || numericCols.length < 2) return [];
    const pairs: { x: string; y: string; corr: number }[] = [];
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
        const xStr = numericCols[i].slice(0, 10);
        const yStr = numericCols[j].slice(0, 10);
        pairs.push({ pair: `${xStr} × ${yStr}`, x: xStr, y: yStr, corr: Math.round(corr * 100) / 100 });
      }
    }
    return pairs.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr)).slice(0, 20);
  }, [dataset, numericCols]);

  const boxplotData = useMemo(() => {
    if (!dataset || !selectedCol) return null;
    const col = dataset.columnStats.find(c => c.name === selectedCol);
    if (!col || col.type !== "numeric") return null;
    
    // Defensive check for all required stats
    if (col.min === undefined || col.max === undefined || col.mean === undefined || col.median === undefined || col.std === undefined) {
      return null;
    }

    return { 
        min: col.min, 
        q1: Math.max(col.min, col.mean - col.std), 
        median: col.median, 
        q3: Math.min(col.max, col.mean + col.std), 
        max: col.max, 
        mean: col.mean 
    };
  }, [dataset, selectedCol]);

  const scatterData = useMemo(() => {
    if (!dataset || !scatterX || !scatterY) return [];
    return dataset.data.map(r => ({ x: Number(r[scatterX]), y: Number(r[scatterY]) }))
      .filter(d => !isNaN(d.x) && !isNaN(d.y))
      .slice(0, 500); // Sample for performance
  }, [dataset, scatterX, scatterY]);

  if (!dataset || !dataset.columnStats || dataset.columnStats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-6 text-center">
        <BarChart3 className="h-16 w-16 text-primary/10 animate-pulse" />
        <p className="text-muted-foreground font-display uppercase tracking-widest opacity-50">Scientific Lab Offline</p>
        <p className="text-xs text-muted-foreground -mt-4">No dataset or statistical vectors found for analysis.</p>
        <button onClick={() => navigate("/")} className="px-10 py-4 rounded-full bg-primary text-white text-xs font-black shadow-glow hover:scale-105 transition-all">UPLOAD TERMINAL</button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="EDA Dashboard" description="Exploratory Data Analysis with interactive visualizations" icon={<BarChart3 className="h-5 w-5" />} />

      <div className="flex flex-col md:flex-row gap-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="md:w-64 flex-shrink-0 glass-card p-4 h-[calc(100vh-12rem)] sticky top-6 overflow-y-auto hidden-scrollbar">
          <h3 className="font-display text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">Features ({dataset.columns})</h3>
          <div className="space-y-1">
            {dataset.columnStats.slice(0, 100).map(c => (
              <button
                key={c.name}
                onClick={() => setSelectedCol(c.name)}
                className={`w-full text-left px-3 py-2 text-[13px] rounded-lg transition-all flex items-center justify-between ${
                  selectedCol === c.name ? "bg-primary/20 text-primary glow-border" : "hover:bg-muted text-foreground"
                }`}
              >
                <span className="truncate">{c.name}</span>
                <span className={`w-2 h-2 rounded-full ${c.type === "numeric" ? "bg-primary" : "bg-accent"}`} />
              </button>
            ))}
            {dataset.columnStats.length > 100 && (
               <div className="px-3 py-2 text-xs text-muted-foreground italic text-center">
                 +{dataset.columnStats.length - 100} ignored (Requires Feature Selection)
               </div>
            )}
          </div>
        </motion.div>

        <div className="flex-1 space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} key={`chart-${selectedCol}`} className="glass-card p-5">
              <h3 className="font-display font-semibold text-sm mb-1">
                {chartData.type === "numeric" ? "Distribution Histogram" : "Category Frequency"}
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                {chartData.type === "numeric" ? `Frequency of values for ${selectedCol}` : `Top occurrences in ${selectedCol}`}
              </p>
              {chartData.data.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={chartData.data}>
                    <XAxis 
                      dataKey="label" 
                      tick={{ fontSize: 9, fill: "hsl(215,15%,55%)" }} 
                      axisLine={false} 
                      tickLine={false} 
                      interval={chartData.type === "numeric" ? "preserveStartEnd" : 0} 
                      minTickGap={10} 
                    />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(215,15%,55%)" }} axisLine={false} tickLine={false} />
                    <Tooltip 
                      cursor={{ fill: "hsl(var(--primary)/0.1)" }} 
                      contentStyle={{ background: "hsl(222,40%,9%)", border: "1px solid hsl(222,25%,16%)", borderRadius: 12, fontSize: 12, color: "white" }} 
                      itemStyle={{ color: "white" }}
                      labelStyle={{ color: "hsl(215,15%,75%)", fontWeight: "bold" }}
                    />
                    <Bar dataKey="value" fill={chartData.type === "numeric" ? "hsl(190,90%,50%)" : "hsl(260,70%,60%)"} radius={[3, 3, 0, 0]} animationDuration={800} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center border border-dashed rounded-lg border-border bg-muted/20">
                  <p className="text-muted-foreground text-sm text-center">Select a variable from the sidebar to visualize.</p>
                </div>
              )}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} key={`box-${selectedCol}`} className="glass-card p-5">
              <h3 className="font-display font-semibold text-sm mb-1">Box Plot Summary</h3>
              <p className="text-xs text-muted-foreground mb-4">Statistical summary for {selectedCol || "..."}</p>
              {boxplotData ? (
                <div className="flex flex-col items-center justify-center h-[250px] gap-3">
                  <div className="w-full max-w-[200px] border border-border bg-muted/10 p-4 rounded-xl">
                    {[
                      { label: "Max", value: boxplotData.max },
                      { label: "Q3 (75%)", value: boxplotData.q3 },
                      { label: "Median", value: boxplotData.median },
                      { label: "Mean", value: boxplotData.mean },
                      { label: "Q1 (25%)", value: boxplotData.q1 },
                      { label: "Min", value: boxplotData.min },
                    ].map((item, i) => (
                      <div key={item.label} className={`flex justify-between items-center py-2 ${i < 5 ? "border-b border-border/30" : ""}`}>
                        <span className="text-xs text-muted-foreground">{item.label}</span>
                        <span className={`text-sm font-medium font-display ${item.label === 'Median' ? 'text-primary' : ''}`}>{item.value.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[250px] flex items-center justify-center border border-dashed rounded-lg border-border bg-muted/20">
                  <p className="text-muted-foreground text-sm text-center">Select a numeric column.</p>
                </div>
              )}
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-5">
            <h3 className="font-display font-semibold text-sm mb-4">Scatter Plot Builder</h3>
            <div className="flex gap-4 mb-6">
              <div className="flex flex-col flex-1">
                <label className="text-[10px] text-primary uppercase tracking-wider mb-1">Axis X</label>
                <select value={scatterX} onChange={e => setScatterX(e.target.value)} className="w-full p-2 rounded-lg bg-card border border-border text-xs focus:ring-1 focus:ring-primary outline-none">
                  <option value="">Select X axis...</option>
                  {numericCols.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex-1 flex flex-col">
                <label className="text-[10px] text-accent uppercase tracking-wider mb-1">Axis Y</label>
                <select value={scatterY} onChange={e => setScatterY(e.target.value)} className="w-full p-2 rounded-lg bg-card border border-border text-xs focus:ring-1 focus:ring-accent outline-none">
                  <option value="">Select Y axis...</option>
                  {numericCols.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            
            <div className="h-[300px] w-full mt-2">
              {scatterData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis type="number" dataKey="x" name={scatterX} tick={{ fontSize: 10, fill: "hsl(215,15%,55%)" }} axisLine={false} tickLine={false} />
                    <YAxis type="number" dataKey="y" name={scatterY} tick={{ fontSize: 10, fill: "hsl(215,15%,55%)" }} axisLine={false} tickLine={false} />
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }} 
                      contentStyle={{ background: "hsl(222,40%,9%)", border: "1px solid hsl(222,25%,16%)", borderRadius: 12, fontSize: 12, color: "white" }} 
                      itemStyle={{ color: "white" }}
                      labelStyle={{ color: "hsl(215,15%,75%)", fontWeight: "bold" }}
                    />
                    <Scatter name="Points" data={scatterData} fill="hsl(260,70%,60%)" shape="circle" fillOpacity={0.6} />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center border border-dashed rounded-lg border-border bg-muted/10">
                   <p className="text-muted-foreground text-sm text-center">Select X and Y numeric axes to build plot.</p>
                </div>
              )}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-5">
            <h3 className="font-display font-semibold text-sm mb-4">Correlation Heatmap (Top 20 Absolute Relations)</h3>
            {correlationData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={correlationData} layout="vertical" margin={{ left: 80 }}>
                  <XAxis type="number" domain={[-1, 1]} tick={{ fontSize: 10, fill: "hsl(215,15%,55%)" }} axisLine={false} />
                  <YAxis type="category" dataKey="pair" tick={{ fontSize: 9, fill: "hsl(215,15%,55%)" }} axisLine={false} width={80} />
                  <Tooltip 
                    contentStyle={{ background: "hsl(222,40%,9%)", border: "1px solid hsl(222,25%,16%)", borderRadius: 12, fontSize: 12, color: "white" }} 
                    itemStyle={{ color: "white" }}
                    labelStyle={{ color: "hsl(215,15%,75%)", fontWeight: "bold" }}
                  />
                  <Bar dataKey="corr" radius={[0, 4, 4, 0]}>
                    {correlationData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.corr < 0 ? "hsl(340,75%,55%)" : "hsl(190,90%,50%)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-12">Need at least 2 numeric columns</p>
            )}
          </motion.div>
        </div>
      </div>
      <PageFooter nextLabel="Imputation Lab" nextUrl="/imputation" />
    </div>
  );
}
