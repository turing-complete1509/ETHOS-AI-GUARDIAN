import { ReactNode } from "react";
import { motion } from "framer-motion";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  color?: string;
}

export function KpiCard({ title, value, subtitle, icon, color = "text-primary" }: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="kpi-card"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{title}</p>
          <p className={`text-xl font-display font-black mt-1 ${color} truncate`} title={String(value)}>{value}</p>
          {subtitle && <p className="text-[9px] text-muted-foreground mt-1 truncate">{subtitle}</p>}
        </div>
        <div className={`p-2 rounded-lg bg-primary/10 ${color}`}>{icon}</div>
      </div>
    </motion.div>
  );
}
