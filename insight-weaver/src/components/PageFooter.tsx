import { motion } from "framer-motion";
import { ArrowRight, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PageFooterProps {
  nextLabel: string;
  nextUrl: string;
  disabled?: boolean;
  disabledMessage?: string;
}

export function PageFooter({ nextLabel, nextUrl, disabled, disabledMessage }: PageFooterProps) {
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
        {disabled && disabledMessage && (
          <span className="text-[10px] text-destructive mt-1 font-bold">{disabledMessage}</span>
        )}
      </div>
      <button
        onClick={() => !disabled && navigate(nextUrl)}
        disabled={disabled}
        className={`group relative flex items-center gap-2 px-8 py-4 rounded-full text-xs uppercase tracking-widest font-black transition-all
          ${disabled 
            ? "bg-muted text-muted-foreground cursor-not-allowed" 
            : "bg-primary text-primary-foreground shadow-glow hover:scale-105"
          }
        `}
      >
        <span>Proceed</span>
        <ArrowRight className={`h-4 w-4 transition-transform ${!disabled ? "group-hover:translate-x-1" : ""}`} />
      </button>
    </motion.div>
  );
}
