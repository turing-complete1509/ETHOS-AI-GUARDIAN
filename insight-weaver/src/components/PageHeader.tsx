import { motion } from "framer-motion";
import { ReactNode } from "react";

export function PageHeader({ title, description, icon }: { title: string; description: string; icon?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6"
    >
      <div className="flex items-center gap-3">
        {icon && <div className="p-2 rounded-lg bg-primary/10 text-primary">{icon}</div>}
        <div>
          <h1 className="text-2xl font-display font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </motion.div>
  );
}
