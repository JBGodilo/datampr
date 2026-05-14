import { runPipeline } from "@/lib/pipeline/runner";
import type { PipelineEvent, PipelineInput, RowResult, StageId } from "@/lib/pipeline/types";
import { getUserContext, unauthorizedResponse } from "@/lib/supabase/user-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPA_URL = process.env.SUPABASE_URL ?? "";
const SUPA_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const HISTORY_TABLE = "import_history";

type SuccessfulRecord = {
  sourceIndex: number;
  hubspotId?: string;
  values: Record<string, unknown>;
};

type FailedRecord = {
  sourceIndex: number;
  stage: StageId;
  reasons: string[];
  values: Record<string, unknown>;
};

export async function POST(request: Request) {
  const userCtx = await getUserContext();
  if (!userCtx) return unauthorizedResponse();

  let input: PipelineInput;
  try {
    input = (await request.json()) as PipelineInput;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(input.rows) || !Array.isArray(input.headers)) {
    return Response.json({ ok: false, error: "rows and headers are required." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const collectedRows: RowResult[] = [];
      let durationMs = 0;
      let fatal: string | null = null;
      const droppedByStage = new Map<StageId, { sourceIndex: number; reasons: string[] }[]>();
      const startedAt = Date.now();

      const write = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        for await (const event of runPipeline(input, { accessToken: userCtx.accessToken })) {
          write(event);
          collectEvent(event, collectedRows, droppedByStage);
          if (event.type === "done") {
            durationMs = event.summaries.reduce((sum, s) => sum + s.durationMs, 0);
          }
        }
      } catch (err) {
        fatal = (err as Error).message;
        write({ type: "fatal", error: fatal });
      }

      // Persist a single history row BEFORE closing the stream. On serverless
      // platforms (Vercel) the function instance is terminated as soon as the
      // response stream closes — any awaited work after controller.close()
      // can be killed mid-flight, which is why history rows were going
      // missing in production. Doing it here keeps it inside the request's
      // execution budget. Best-effort: failures are logged, never thrown.
      try {
        await persistImportHistory(input, userCtx, {
          rowResults: collectedRows,
          droppedByStage,
          durationMs: durationMs || Date.now() - startedAt,
          fatal,
        });
      } catch (err) {
        console.error("Failed to persist import history:", err);
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function collectEvent(
  event: PipelineEvent | { type: "fatal"; error: string },
  rowResults: RowResult[],
  droppedByStage: Map<StageId, { sourceIndex: number; reasons: string[] }[]>,
) {
  if (event.type === "row") {
    rowResults.push(event.result);
    return;
  }
  if (event.type === "stage:done") {
    if (event.summary.dropped.length > 0) {
      const existing = droppedByStage.get(event.summary.stage) ?? [];
      for (const d of event.summary.dropped) {
        existing.push({ sourceIndex: d.sourceIndex, reasons: d.reasons });
      }
      droppedByStage.set(event.summary.stage, existing);
    }
  }
}

async function persistImportHistory(
  input: PipelineInput,
  userCtx: { userId: string; accessToken: string },
  result: {
    rowResults: RowResult[];
    droppedByStage: Map<StageId, { sourceIndex: number; reasons: string[] }[]>;
    durationMs: number;
    fatal: string | null;
  },
) {
  if (!SUPA_URL || !SUPA_KEY) return;

  const sourceRows = input.rows;
  const successfulRecords: SuccessfulRecord[] = [];
  const failedRecords: FailedRecord[] = [];
  const seenFailed = new Set<number>();

  for (const r of result.rowResults) {
    const values = sourceRows[r.sourceIndex - 1] ?? {};
    if (r.status === "ok") {
      successfulRecords.push({
        sourceIndex: r.sourceIndex,
        hubspotId: r.hubspotId,
        values,
      });
    } else {
      seenFailed.add(r.sourceIndex);
      failedRecords.push({
        sourceIndex: r.sourceIndex,
        stage: "import",
        reasons: [r.message ?? "Unknown error"],
        values,
      });
    }
  }

  for (const [stage, drops] of result.droppedByStage) {
    if (stage === "import") continue;
    for (const d of drops) {
      if (seenFailed.has(d.sourceIndex)) continue;
      failedRecords.push({
        sourceIndex: d.sourceIndex,
        stage,
        reasons: d.reasons,
        values: sourceRows[d.sourceIndex - 1] ?? {},
      });
    }
  }

  successfulRecords.sort((a, b) => a.sourceIndex - b.sourceIndex);
  failedRecords.sort((a, b) => a.sourceIndex - b.sourceIndex);

  const body = {
    user_id: userCtx.userId,
    object_type: input.objectType,
    source_label: input.sourceLabel ?? null,
    hubspot_connection_id: input.hubspotConnectionId ?? null,
    hubspot_connection_label: input.hubspotConnectionLabel ?? null,
    pipeline_label: input.pipelineLabel ?? null,
    stage_label: input.stageLabel ?? null,
    validation_rule_label: input.validationRuleLabel ?? null,
    total_rows: sourceRows.length,
    ok_count: successfulRecords.length,
    error_count: failedRecords.length,
    duration_ms: result.durationMs,
    fatal_error: result.fatal,
    successful_records: successfulRecords,
    failed_records: failedRecords,
  };

  const res = await fetch(`${SUPA_URL}/rest/v1/${HISTORY_TABLE}`, {
    method: "POST",
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${userCtx.accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`Supabase insert into ${HISTORY_TABLE} failed (${res.status}):`, text);
  }
}
