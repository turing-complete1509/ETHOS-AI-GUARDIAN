import { useCallback, useState } from "react";
import { Upload, FileSpreadsheet, Rows3, Columns3, AlertTriangle, ShieldCheck, Zap, Heart, Globe, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";
import { useData } from "@/context/DataContext";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { useNavigate } from "react-router-dom";
import { PageFooter } from "@/components/PageFooter";

export default function UploadPage() {
  const { setDataset, dataset } = useData();
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleAnalysis = useCallback((params: { file?: File, rawData?: any[], fileName: string }) => {
    setLoading(true);
    setProgress(0);
    setError(null);
    
    const worker = new Worker(new URL('../lib/dataWorker.ts', import.meta.url), { type: 'module' });
    
    worker.onmessage = (e) => {
      const { type, progress, info, message } = e.data;
      if (type === "progress") {
        setProgress(progress);
      } else if (type === "complete") {
        setDataset(info);
        setLoading(false);
        worker.terminate();
      } else if (type === "error") {
        setError(message);
        setLoading(false);
        worker.terminate();
      }
    };

    worker.onerror = (e) => {
      setError("Worker initialization failed.");
      setLoading(false);
      worker.terminate();
    };

    worker.postMessage(params);
  }, [setDataset, navigate]);

  const processFile = useCallback((file: File) => {
    setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "csv") {
      handleAnalysis({ file, fileName: file.name });
    } else if (ext === "xlsx" || ext === "xls") {
      setLoading(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: "binary" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(ws) as Record<string, any>[];
          handleAnalysis({ rawData: data, fileName: file.name });
        } catch (e: any) {
          setError(e.message);
          setLoading(false);
        }
      };
      reader.readAsBinaryString(file);
    } else {
      setError("Unsupported file format.");
    }
  }, [handleAnalysis]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-24">
      {/* HERO SECTION */}
      {!dataset && (
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-8 py-12 hero-gradient rounded-[3rem]"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-[0.2em] animate-float">
            <Sparkles className="h-3 w-3" /> Mission: Unbiased AI Decision
          </div>
          <h1 className="text-6xl md:text-8xl font-display font-black tracking-tighter max-w-4xl mx-auto leading-[0.9]">
            Ensuring <span className="text-primary italic">Fairness</span> in Automated World.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Detecting and fixing harmful bias before systems impact real people. Built to inspect, measure, and audit for hidden discrimination in your models.
          </p>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto mt-16 px-4">
             {[
               { icon: ShieldCheck, title: "International Ethics Standards", desc: "Aligned with global frameworks for machine learning.", color: "text-blue-500" },
               { icon: Zap, title: "Real-time Detox", desc: "Automated manifold alignment to neutralize proxy leakage.", color: "text-amber-500" },
               { icon: Globe, title: "Universal Audit", desc: "Cross-domain fairness scoring for finance, hiring, and health.", color: "text-emerald-500" }
             ].map((item, i) => (
               <div key={i} className="glass-card p-6 text-left space-y-3">
                 <item.icon className={`h-6 w-6 ${item.color}`} />
                 <h3 className="text-sm font-bold uppercase tracking-tighter">{item.title}</h3>
                 <p className="text-[10px] text-muted-foreground leading-relaxed">{item.desc}</p>
               </div>
             ))}
          </div>
        </motion.div>
      )}

      {/* UPLOAD SECTION */}
      <div className="max-w-4xl mx-auto">
        <PageHeader 
          title={dataset ? "Dataset Console" : "Data Ingestion"} 
          description={dataset ? `Analyzing ${dataset.fileName}` : "Upload your CSV or Excel file to begin ethical auditing"} 
          icon={<Upload className="h-5 w-5 text-primary" />} 
        />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`glass-card p-12 text-center transition-all duration-300 cursor-pointer relative overflow-hidden group ${dragging ? "border-primary scale-[1.01]" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById("file-input")?.click()}
        >
          {loading && (
            <motion.div 
              className="absolute inset-0 bg-primary/5 flex flex-col items-center justify-center backdrop-blur-sm z-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
               <div className="relative h-24 w-24 flex items-center justify-center mb-4">
                  <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                    <circle className="text-border" strokeWidth="4" stroke="currentColor" fill="transparent" r="45" cx="50" cy="50" />
                    <motion.circle 
                      className="text-primary" 
                      strokeWidth="6" 
                      strokeDasharray="283"
                      strokeDashoffset={283 - (progress / 100) * 283}
                      stroke="currentColor" fill="transparent" r="45" cx="50" cy="50" strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute text-xl font-black">{Math.round(progress)}%</span>
               </div>
               <p className="text-xs font-bold uppercase tracking-widest text-primary animate-pulse">Auditing Tokens...</p>
            </motion.div>
          )}

          <input id="file-input" type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileInput} />
          <div className="flex flex-col items-center gap-6">
            <div className="p-6 rounded-3xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Upload className={`h-12 w-12 text-primary ${loading ? "animate-bounce" : ""}`} />
            </div>
            <div>
              <p className="text-2xl font-display font-black tracking-tighter">
                {dataset ? "Replace Dataset" : "Drag & Drop Your Data"}
              </p>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                Our engine automatically identifies potential demographic proxies and hidden bias signatures during ingestion.
              </p>
            </div>
            <div className="flex gap-4">
               <div className="px-4 py-1.5 rounded-full bg-muted text-[10px] font-bold uppercase tracking-widest">CSV Support</div>
               <div className="px-4 py-1.5 rounded-full bg-muted text-[10px] font-bold uppercase tracking-widest">Excel Support</div>
            </div>
            {error && <p className="text-sm text-destructive font-bold">{error}</p>}
          </div>
        </motion.div>

        {dataset && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-12 space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard title="File" value={dataset.fileName} icon={<FileSpreadsheet className="h-4 w-4" />} />
              <KpiCard title="Rows" value={dataset.rows.toLocaleString()} icon={<Rows3 className="h-4 w-4" />} />
              <KpiCard title="Columns" value={dataset.columns} icon={<Columns3 className="h-4 w-4" />} />
              <KpiCard title="Missing %" value={`${dataset.missingPct.toFixed(1)}%`} icon={<AlertTriangle className="h-4 w-4" />} color="text-destructive" />
            </div>

            <div className="glass-card overflow-hidden">
              <div className="p-6 border-b border-border bg-muted/20 flex justify-between items-center">
                <h3 className="font-display font-black text-sm uppercase tracking-widest">Raw Data Preview</h3>
                <div className="text-[10px] font-mono text-muted-foreground">Showing top 20 observation vectors</div>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      {dataset.headers.slice(0, 15).map(h => (
                        <th key={h} className="px-6 py-4 text-left font-black uppercase tracking-tighter text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.data.slice(0, 20).map((row, i) => (
                      <tr key={i} className="border-t border-border/30 hover:bg-primary/5 transition-colors group">
                        {dataset.headers.slice(0, 15).map(h => (
                          <td key={h} className="px-6 py-3 whitespace-nowrap text-foreground/80 group-hover:text-foreground">
                            {row[h] === null || row[h] === undefined || row[h] === "" ? (
                              <span className="text-destructive/40 italic font-mono text-[9px]">NULL_VAL</span>
                            ) : String(row[h])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* FOOTER SECTION */}
      {dataset && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-12">
          <PageFooter nextLabel="Run Ethical Audit" nextUrl="/overview" />
        </motion.div>
      )}

      {!dataset && (
        <div className="max-w-4xl mx-auto py-12 border-t border-border/50 text-center space-y-6">
           <div className="flex flex-col items-center gap-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.5em] font-black">Elite Audit Engine Active</p>
              <button 
                onClick={() => {
                  const demoData = Array.from({ length: 1000 }).map((_, i) => ({
                    id: i,
                    age: Math.floor(Math.random() * 60) + 18,
                    gender: Math.random() > 0.5 ? "Male" : "Female",
                    income: Math.random() * 100000 + 20000,
                    credit_score: Math.random() * 500 + 300,
                    years_experience: Math.floor(Math.random() * 20),
                    hired: Math.random() > 0.6 ? "Yes" : "No"
                  }));
                  setDataset({
                    fileName: "PRO_DEMO_DATASET.csv",
                    rows: 1000,
                    columns: 7,
                    headers: ["age", "gender", "income", "credit_score", "years_experience", "hired"],
                    data: demoData,
                    missingTotal: 0,
                    missingPct: 0,
                    duplicateRows: 0,
                    numericCols: 4,
                    categoricalCols: 2,
                    columnStats: [
                      { name: "age", type: "numeric", missing: 0, missingPct: 0, unique: 60, min: 18, max: 78, mean: 45, std: 12 },
                      { name: "gender", type: "categorical", missing: 0, missingPct: 0, unique: 2 },
                      { name: "income", type: "numeric", missing: 0, missingPct: 0, unique: 1000, min: 20000, max: 120000, mean: 65000, std: 25000 },
                      { name: "credit_score", type: "numeric", missing: 0, missingPct: 0, unique: 800, min: 300, max: 850, mean: 680, std: 100 },
                      { name: "years_experience", type: "numeric", missing: 0, missingPct: 0, unique: 20, min: 0, max: 20, mean: 8, std: 5 },
                      { name: "hired", type: "categorical", missing: 0, missingPct: 0, unique: 2 }
                    ]
                  });
                  toast.success("Pro Research Dataset Loaded!");
                }}
                className="px-12 py-5 rounded-full bg-white text-primary border-2 border-primary font-black uppercase text-xs tracking-[0.2em] shadow-glow hover:bg-primary hover:text-white transition-all active:scale-95"
              >
                Launch Pro Demo Dataset
              </button>
           </div>
           <Heart className="h-6 w-6 text-primary mx-auto animate-pulse" />
        </div>
      )}
    </div>
  );
}
