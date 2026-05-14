import { promises as dns } from "node:dns";
import { isDomainLike, validateRow, type ValidationRuleSet } from "@/lib/validators";
import type { DroppedRow, PipelineRow, StageSummary } from "./types";

async function defaultDomainCheck(domain: string): Promise<boolean> {
  if (!isDomainLike(domain)) return false;
  const mx = await dns.resolveMx(domain).catch(() => [] as { exchange: string }[]);
  if (mx.length > 0) return true;
  const a = await dns.resolve4(domain).catch(() => [] as string[]);
  if (a.length > 0) return true;
  const aaaa = await dns.resolve6(domain).catch(() => [] as string[]);
  return aaaa.length > 0;
}

export async function validate(
  rows: PipelineRow[],
  ruleSet: ValidationRuleSet | null,
): Promise<{ rows: PipelineRow[]; summary: Omit<StageSummary, "stage" | "durationMs"> }> {
  if (!ruleSet) {
    return {
      rows,
      summary: {
        input: rows.length,
        output: rows.length,
        modified: 0,
        dropped: [],
        notes: ["No validation rule selected — all rows passed through."],
      },
    };
  }

  const domainCache = new Map<string, boolean>();
  const checkDomain = async (domain: string) => {
    const cached = domainCache.get(domain);
    if (cached !== undefined) return cached;
    const ok = await defaultDomainCheck(domain);
    domainCache.set(domain, ok);
    return ok;
  };

  const kept: PipelineRow[] = [];
  const dropped: DroppedRow[] = [];

  for (const row of rows) {
    const result = await validateRow(row.values, ruleSet, checkDomain);
    if (result.valid) {
      kept.push(row);
    } else {
      dropped.push({ sourceIndex: row.sourceIndex, stage: "validate", reasons: result.errors });
    }
  }

  return {
    rows: kept,
    summary: {
      input: rows.length,
      output: kept.length,
      modified: 0,
      dropped,
    },
  };
}
