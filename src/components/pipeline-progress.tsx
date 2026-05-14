"use client";

import { CheckCircle2, ChevronDown, Loader2, XCircle, Circle } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { STAGE_IDS, type StageId, type StageSummary } from "@/lib/pipeline/types";

const STAGE_LABEL: Record<StageId, string> = {
  normalize: "Normalization",
  validate: "Validation Engine",
  map: "Transformation / Mapping",
  dedup: "Deduplication",
  associations: "Association Validation",
  import: "CRM Import",
};

export type StageState = "pending" | "running" | "done" | "error";

export type PipelineProgressProps = {
  states: Partial<Record<StageId, StageState>>;
  summaries: Partial<Record<StageId, StageSummary>>;
  errors: Partial<Record<StageId, string>>;
  importProgress?: { current: number; total: number };
  fatal?: string | null;
};

function StateIcon({ state }: { state: StageState }) {
  if (state === "done") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (state === "error") return <XCircle className="h-4 w-4 text-destructive" />;
  if (state === "running") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  return <Circle className="h-4 w-4 text-muted-foreground/50" />;
}

export function PipelineProgress({
  states,
  summaries,
  errors,
  importProgress,
  fatal,
}: PipelineProgressProps) {
  return (
    <div className="space-y-3">
      {fatal && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {fatal}
        </div>
      )}

      <Accordion type="multiple" className="rounded-md border">
        {STAGE_IDS.map((stage) => {
          const state = states[stage] ?? "pending";
          const summary = summaries[stage];
          const error = errors[stage];
          return (
            <AccordionItem key={stage} value={stage} className="border-b last:border-b-0">
              <AccordionTrigger className="px-3 hover:no-underline">
                <div className="flex flex-1 items-center gap-3">
                  <StateIcon state={state} />
                  <span className="font-medium">{STAGE_LABEL[stage]}</span>
                  {summary && (
                    <span className="text-xs text-muted-foreground">
                      {summary.input} → {summary.output}
                      {summary.modified > 0 && ` · ${summary.modified} modified`}
                      {summary.dropped.length > 0 && ` · ${summary.dropped.length} dropped`}
                    </span>
                  )}
                  {state === "running" && stage === "import" && importProgress && (
                    <span className="text-xs text-muted-foreground">
                      {importProgress.current}/{importProgress.total}
                    </span>
                  )}
                  {summary && (
                    <Badge variant="outline" className="ml-auto mr-2 text-xs">
                      {summary.durationMs}ms
                    </Badge>
                  )}
                </div>
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3">
                {error && <p className="mb-2 text-sm text-destructive">Error: {error}</p>}
                {state === "running" && stage === "import" && importProgress && (
                  <Progress
                    value={
                      importProgress.total
                        ? Math.round((importProgress.current / importProgress.total) * 100)
                        : 0
                    }
                  />
                )}
                {summary?.notes?.length ? (
                  <ul className="mb-2 space-y-0.5 text-xs text-muted-foreground">
                    {summary.notes.map((n, i) => (
                      <li key={i}>· {n}</li>
                    ))}
                  </ul>
                ) : null}
                {summary?.dropped.length ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium">Dropped rows</p>
                    <div className="max-h-48 space-y-0.5 overflow-y-auto rounded border bg-muted/30 p-2 text-xs">
                      {summary.dropped.slice(0, 100).map((d) => (
                        <div key={d.sourceIndex} className="flex items-start gap-2">
                          <span className="shrink-0 font-mono text-muted-foreground">
                            #{d.sourceIndex}
                          </span>
                          <span>{d.reasons.join("; ")}</span>
                        </div>
                      ))}
                      {summary.dropped.length > 100 && (
                        <p className="text-muted-foreground">
                          …and {summary.dropped.length - 100} more
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}
                {!summary && state === "pending" && (
                  <p className="text-xs text-muted-foreground">Waiting to run.</p>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

export function stageStatesFromEvent(
  prev: Partial<Record<StageId, StageState>>,
  event:
    | { type: "stage:start"; stage: StageId }
    | { type: "stage:done"; summary: { stage: StageId } }
    | { type: "stage:error"; stage: StageId },
): Partial<Record<StageId, StageState>> {
  const next = { ...prev };
  if (event.type === "stage:start") next[event.stage] = "running";
  else if (event.type === "stage:done") next[event.summary.stage] = "done";
  else if (event.type === "stage:error") next[event.stage] = "error";
  return next;
}

// Helper to assemble a class to fade out completed stages — kept here so we
// don't pollute page.tsx with cn calls.
export function stageRowClass(state: StageState): string {
  return cn(state === "pending" && "opacity-60");
}
