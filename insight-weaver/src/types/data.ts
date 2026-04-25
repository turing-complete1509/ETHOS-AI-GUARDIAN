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
