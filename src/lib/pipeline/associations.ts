import type { PipelineRow, StageSummary } from "./types";

// v1: passthrough. Hook is in place so we can add real association rules
// (e.g. "deal.email must match an existing contact") without changing the
// pipeline contract.
export async function validateAssociations(
  rows: PipelineRow[],
): Promise<{ rows: PipelineRow[]; summary: Omit<StageSummary, "stage" | "durationMs"> }> {
  return {
    rows,
    summary: {
      input: rows.length,
      output: rows.length,
      modified: 0,
      dropped: [],
      notes: ["No association rules configured — passthrough."],
    },
  };
}
