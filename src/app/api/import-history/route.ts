import type { HsObjectId } from "@/lib/hubspot-objects";
import type { StageId } from "@/lib/pipeline/types";

const SUPA_URL = process.env.SUPABASE_URL ?? "";
const SUPA_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
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

function envError() {
  if (!SUPA_URL || !SUPA_KEY) {
    return Response.json(
      { ok: false, error: "SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is not set." },
      { status: 500 },
    );
  }
  return null;
}

export async function GET(request: Request) {
  const err = envError();
  if (err) return err;

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));

  const params = new URLSearchParams({
    select: "*",
    order: "created_at.desc",
    limit: String(limit),
  });

  const res = await fetch(`${SUPA_URL}/rest/v1/${TABLE}?${params.toString()}`, {
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
    },
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
