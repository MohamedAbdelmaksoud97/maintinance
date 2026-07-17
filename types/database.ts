export type QualityStatus = "COMPLETE" | "MISSING_DATA" | "NEEDS_REVIEW" | "INVALID";

export type DashboardSummary = {
  importFiles: number;
  importedRows: number;
  completeRows: number;
  missingRows: number;
  reviewRows: number;
  invalidRows: number;
  unassignedTasks: number;
  missedTasks: number;
  dueToday: number;
  dueNext7Days: number;
  dueNext30Days: number;
  shutdownTasks: number;
  materials: number;
  equipment: number;
  pendingWorkers: number;
  todayNotifications: number;
  lowStockMaterials: number;
};

export type ImportBatchSummary = {
  id: string;
  label: string;
  started_at: string;
  completed_at: string | null;
  summary: Record<string, unknown>;
};
