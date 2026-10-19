export type FunctionCount = { name: string; count: number };

export type PeriodUsage = {
  startAt?: string;
  firestore?: { reads: number; writes: number; deletes: number };
  egressBytes?: number;
  functions?: { invocations: number; top: FunctionCount[] };
};

/** `adminStats/usage`, written by collectUsageStats / refreshUsageStats. */
export type UsageDoc = {
  project?: string;
  today?: PeriodUsage;
  month?: PeriodUsage;
  storage?: { appBucketBytes: number | null; totalBytes: number; buckets: { name: string; bytes: number }[] };
  quota?: { resetsAt: string; israelHour: number; israelMinute: number };
  errors?: string[];
  /** Firestore Timestamp (has toMillis) once written. */
  updatedAt?: { toMillis: () => number } | null;
};
