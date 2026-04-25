import { motion } from "framer-motion";
import { ArrowRight, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PageFooterProps {
  nextLabel: string;
  nextUrl: string;
}

export function PageFooter({ nextLabel, nextUrl }: PageFooterProps) {
  const navigate = useNavigate();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="mt-12 flex justify-end items-center pb-8 border-t border-border pt-8"
    >
      <div className="flex flex-col items-end mr-6">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Suggested Next Step</span>
        <span className="text-sm font-display font-semibold">{nextLabel}</span>
      </div>
      <button
        onClick={() => navigate(nextUrl)}
        className="group relative flex items-center gap-2 px-8 py-4 rounded-full bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest shadow-glow hover:scale-105 transition-all"
      >
        <span>Proceed</span>
        <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
      </button>
    </motion.div>
  );
}
