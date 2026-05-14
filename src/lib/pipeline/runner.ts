import { getHsObject } from "@/lib/hubspot-objects";
import { HUBSPOT_NOT_CONFIGURED_ERROR, resolveHubspotToken } from "@/lib/hubspot/token";
import type { ValidationRuleSet } from "@/lib/validators";
import { validateAssociations } from "./associations";
import { dedup } from "./dedup";
import { importRow } from "./import";
import { mapAndPrepareProperties } from "./map";
import { normalize } from "./normalize";
import type {
  PipelineEvent,
  PipelineInput,
  PipelineRow,
  RowResult,
  StageId,
  StageSummary,
} from "./types";
import { validate } from "./validate";

async function loadValidationRule(id: string): Promise<ValidationRuleSet | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const res = await fetch(
    `${url}/rest/v1/object_validation_rules?id=eq.${encodeURIComponent(id)}&select=rules`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as { rules?: ValidationRuleSet }[];
  return rows[0]?.rules ?? null;
}

async function* runStage<T>(
  stage: StageId,
  input: number,
  work: () => Promise<{ rows: T; summary: Omit<StageSummary, "stage" | "durationMs"> }>,
): AsyncGenerator<PipelineEvent, { rows: T; summary: StageSummary }> {
  yield { type: "stage:start", stage, input };
  const start = Date.now();
  try {
    const { rows, summary } = await work();
    const full: StageSummary = { ...summary, stage, durationMs: Date.now() - start };
    yield { type: "stage:done", summary: full };
    return { rows, summary: full };
  } catch (err) {
    yield { type: "stage:error", stage, error: (err as Error).message };
    throw err;
  }
}

export async function* runPipeline(input: PipelineInput): AsyncGenerator<PipelineEvent> {
  const hubspotToken = await resolveHubspotToken(input.hubspotConnectionId);
  if (!hubspotToken) {
    yield { type: "stage:error", stage: "normalize", error: HUBSPOT_NOT_CONFIGURED_ERROR };
    return;
  }

  const obj = getHsObject(input.objectType);
  if (!obj) {
    yield {
      type: "stage:error",
      stage: "normalize",
      error: `Unknown object type: ${input.objectType}`,
    };
    return;
  }

  const ruleSet = input.validationRuleId ? await loadValidationRule(input.validationRuleId) : null;
  const dedupOptions = input.dedupOptions ?? { withinBatch: true, againstCrm: true };

  const initialRows: PipelineRow[] = input.rows.map((values, i) => ({
    sourceIndex: i + 1,
    values: { ...values },
  }));

  const summaries: StageSummary[] = [];
  const results: RowResult[] = [];

  // 1. Normalize
  const normalizeStep = yield* runStage("normalize", initialRows.length, async () =>
    normalize(initialRows),
  );
  summaries.push(normalizeStep.summary);

  // 2. Validate
  const validateStep = yield* runStage("validate", normalizeStep.rows.length, async () =>
    validate(normalizeStep.rows, ruleSet),
  );
  summaries.push(validateStep.summary);

  // 3. Map (+ side effect: create missing HubSpot properties)
  const mapStep = yield* runStage("map", validateStep.rows.length, async () =>
    mapAndPrepareProperties(validateStep.rows, input.headers, obj, hubspotToken),
  );
  summaries.push(mapStep.summary);

  // 4. Dedup
  const dedupStep = yield* runStage("dedup", mapStep.rows.length, async () =>
    dedup(mapStep.rows, input.objectType, hubspotToken, dedupOptions),
  );
  summaries.push(dedupStep.summary);

  // 5. Associations (passthrough v1)
  const assocStep = yield* runStage("associations", dedupStep.rows.length, async () =>
    validateAssociations(dedupStep.rows),
  );
  summaries.push(assocStep.summary);

  // 6. Import — per-row, with progress + row events
  const toImport = assocStep.rows;
  yield { type: "stage:start", stage: "import", input: toImport.length };
  const importStart = Date.now();
  let okCount = 0;
  let errCount = 0;
  for (let i = 0; i < toImport.length; i++) {
    const result = await importRow(toImport[i], {
      obj,
      hubspotToken,
      pipelineId: input.pipelineId,
      stageId: input.stageId,
    });
    results.push(result);
    if (result.status === "ok") okCount++;
    else errCount++;
    yield { type: "row", result };
    yield { type: "progress", stage: "import", current: i + 1, total: toImport.length };
  }
  const importSummary: StageSummary = {
    stage: "import",
    input: toImport.length,
    output: okCount,
    modified: 0,
    durationMs: Date.now() - importStart,
    dropped: results
      .filter((r) => r.status === "error")
      .map((r) => ({
        sourceIndex: r.sourceIndex,
        stage: "import" as const,
        reasons: [r.message ?? "Unknown error"],
      })),
    notes: errCount ? [`${errCount} row(s) rejected by HubSpot.`] : undefined,
  };
  summaries.push(importSummary);
  yield { type: "stage:done", summary: importSummary };

  yield { type: "done", summaries, results };
}
