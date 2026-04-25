import React, { createContext, useContext, useState, ReactNode } from "react";

export interface ColumnStats {
  name: string;
  type: "numeric" | "categorical" | "datetime" | "boolean";
  missing: number;
  missingPct: number;
  unique: number;
  mean?: number;
  median?: number;
  std?: number;
  min?: number;
  max?: number;
  topValues?: { value: string; count: number }[];
  relevanceScore?: number;
}

export interface DatasetInfo {
  fileName: string;
  rows: number;
  columns: number;
  missingTotal: number;
  missingPct: number;
  duplicateRows: number;
  numericCols: number;
  categoricalCols: number;
  columnStats: ColumnStats[];
  data: Record<string, any>[];
  headers: string[];
}

interface DataContextType {
  dataset: DatasetInfo | null;
  setDataset: (d: DatasetInfo | null) => void;
  debiasedDataset: DatasetInfo | null;
  setDebiasedDataset: (d: DatasetInfo | null) => void;
  targetColumn: string | null;
  setTargetColumn: (c: string | null) => void;
  sensitiveColumn: string | null;
  setSensitiveColumn: (c: string | null) => void;
  safeList: string[];
  setSafeList: (list: string[]) => void;
  toggleSafeColumn: (column: string) => void;
  darkMode: boolean;
  setDarkMode: (d: boolean) => void;
  modelResults: any | null;
  setModelResults: (r: any | null) => void;
  
  // PERSISTED ANALYSIS HISTORY
  fairnessLogs: string[];
  setFairnessLogs: (l: string[] | ((prev: string[]) => string[])) => void;
  scanComplete: boolean;
  setScanComplete: (b: boolean) => void;
  modelLogs: string[];
  setModelLogs: (l: string[] | ((prev: string[]) => string[])) => void;
  selectionStep: number;
  setSelectionStep: (s: number) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
};

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [dataset, setDataset] = useState<DatasetInfo | null>(null);
  const [debiasedDataset, setDebiasedDataset] = useState<DatasetInfo | null>(null);
  const [targetColumn, setTargetColumn] = useState<string | null>(null);
  const [sensitiveColumn, setSensitiveColumn] = useState<string | null>(null);
  const [safeList, setSafeList] = useState<string[]>([]);
  const [darkMode, setDarkMode] = useState(true);
  const [modelResults, setModelResults] = useState<any | null>(null);

  // HISTORY STATE
  const [fairnessLogs, setFairnessLogs] = useState<string[]>([]);
  const [scanComplete, setScanComplete] = useState(false);
  const [modelLogs, setModelLogs] = useState<string[]>([]);
  const [selectionStep, setSelectionStep] = useState(0);

  const toggleSafeColumn = (column: string) => {
    setSafeList(prev => 
      prev.includes(column) 
        ? prev.filter(c => c !== column) 
        : [...prev, column]
    );
  };

  const handleSetDataset = (d: DatasetInfo | null) => {
    setDataset(d);
    // Reset history only on new dataset
    if (d) {
      setFairnessLogs([]);
      setScanComplete(false);
      setModelLogs([]);
      setSelectionStep(0);
      setDebiasedDataset(null);
      setModelResults(null);
    }
  };

  return (
    <DataContext.Provider value={{ 
      dataset, setDataset: handleSetDataset, 
      debiasedDataset, setDebiasedDataset,
      targetColumn, setTargetColumn, 
      sensitiveColumn, setSensitiveColumn,
      safeList, setSafeList, toggleSafeColumn,
      darkMode, setDarkMode,
      modelResults, setModelResults,
      fairnessLogs, setFairnessLogs,
      scanComplete, setScanComplete,
      modelLogs, setModelLogs,
      selectionStep, setSelectionStep
    }}>
      {children}
    </DataContext.Provider>
  );
};
