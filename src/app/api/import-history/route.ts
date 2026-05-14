import type { HsObjectId } from "@/lib/hubspot-objects";
import type { StageId } from "@/lib/pipeline/types";
import {
  getUserContext,
  supabaseRestUrl,
  supabaseUserHeaders,
  unauthorizedResponse,
} from "@/lib/supabase/user-context";

const TABLE = "import_history";

export type SuccessfulHistoryRecord = {
  sourceIndex: number;
  hubspotId?: string;
  values: Record<string, unknown>;
};

export type FailedHistoryRecord = {
  sourceIndex: number;
  stage: StageId;
  reasons: string[];
  values: Record<string, unknown>;
};

export type ImportHistoryRow = {
  id: string;
  created_at: string;
  object_type: HsObjectId;
  source_label: string | null;
  hubspot_connection_id: string | null;
  hubspot_connection_label: string | null;
  pipeline_label: string | null;
  stage_label: string | null;
  validation_rule_label: string | null;
  total_rows: number;
  ok_count: number;
  error_count: number;
  duration_ms: number;
  fatal_error: string | null;
  successful_records: SuccessfulHistoryRecord[];
  failed_records: FailedHistoryRecord[];
};

export async function GET(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) return unauthorizedResponse();

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));

  const params = new URLSearchParams({
    select: "*",
    order: "created_at.desc",
    limit: String(limit),
  });

  const res = await fetch(`${supabaseRestUrl()}/rest/v1/${TABLE}?${params.toString()}`, {
    headers: supabaseUserHeaders(ctx.accessToken),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return Response.json(
      { ok: false, error: body.message ?? `Supabase error ${res.status}` },
      { status: res.status },
    );
  }

  const imports = (await res.json()) as ImportHistoryRow[];
  return Response.json({ ok: true, imports });
}
