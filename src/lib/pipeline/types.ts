import type { HsObjectId } from "@/lib/hubspot-objects";

export const STAGE_IDS = [
  "normalize",
  "validate",
  "map",
  "dedup",
  "associations",
  "import",
] as const;

export type StageId = (typeof STAGE_IDS)[number];

export type PipelineRow = {
  // 1-based index into the original source dataset; never changes as rows move through stages.
  sourceIndex: number;
  values: Record<string, unknown>;
};

export type DroppedRow = {
  sourceIndex: number;
  stage: StageId;
  reasons: string[];
};

export type StageSummary = {
  stage: StageId;
  input: number;
  output: number;
  modified: number;
  dropped: DroppedRow[];
  durationMs: number;
  notes?: string[];
};

export type RowResult = {
  sourceIndex: number;
  status: "ok" | "error";
  message?: string;
  hubspotId?: string;
};

export type PipelineInput = {
  rows: Record<string, unknown>[];
  headers: string[];
  objectType: HsObjectId;
  pipelineId?: string;
  stageId?: string;
  validationRuleId?: string | null;
  dedupOptions?: { withinBatch: boolean; againstCrm: boolean };
  hubspotConnectionId?: string | null;
  // Display labels snapshotted into import history (not used by runner logic).
  sourceLabel?: string;
  hubspotConnectionLabel?: string;
  pipelineLabel?: string;
  stageLabel?: string;
  validationRuleLabel?: string;
};

export type PipelineEvent =
  | { type: "stage:start"; stage: StageId; input: number }
  | { type: "stage:done"; summary: StageSummary }
  | { type: "stage:error"; stage: StageId; error: string }
  | { type: "row"; result: RowResult }
  | { type: "progress"; stage: StageId; current: number; total: number }
  | { type: "done"; summaries: StageSummary[]; results: RowResult[] };
