"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { HS_OBJECTS } from "@/lib/hubspot-objects";
import type {
  FailedHistoryRecord,
  ImportHistoryRow,
  SuccessfulHistoryRecord,
} from "@/app/api/import-history/route";

const DETAIL_PAGE_SIZE = 20;

export default function ImportHistoryPage() {
  const [imports, setImports] = useState<ImportHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/import-history?limit=50");
      const data = (await res.json()) as {
        ok: boolean;
        imports?: ImportHistoryRow[];
        error?: string;
      };
      if (!data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setImports(data.imports ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Import history</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Every import is stored as a single record with the rows that succeeded and the rows that
            didn&apos;t make it to HubSpot.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </header>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && imports.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : !loading && imports.length === 0 && !error ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-muted-foreground">
          No imports yet. Once you trigger your first migration it&apos;ll show up here.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>When</TableHead>
                <TableHead>Object</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>HubSpot</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Succeeded</TableHead>
                <TableHead className="text-right">Failed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.map((imp) => {
                const isOpen = expandedId === imp.id;
                return (
                  <ImportHistoryRowItem
                    key={imp.id}
                    imp={imp}
                    isOpen={isOpen}
                    onToggle={() => setExpandedId(isOpen ? null : imp.id)}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ImportHistoryRowItem({
  imp,
  isOpen,
  onToggle,
}: {
  imp: ImportHistoryRow;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const objectLabel = HS_OBJECTS[imp.object_type]?.label ?? imp.object_type;
  const when = new Date(imp.created_at);
  const whenLabel = isNaN(when.getTime())
    ? imp.created_at
    : when.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

  return (
    <>
      <TableRow
        onClick={onToggle}
        className={cn("cursor-pointer hover:bg-muted/50", isOpen && "bg-muted/40")}
      >
        <TableCell>
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell className="font-medium text-gray-900">{whenLabel}</TableCell>
        <TableCell>{objectLabel}</TableCell>
        <TableCell className="text-muted-foreground">{imp.source_label ?? "—"}</TableCell>
        <TableCell className="text-muted-foreground">
          {imp.hubspot_connection_label ?? "—"}
        </TableCell>
        <TableCell className="text-right tabular-nums">{imp.total_rows.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums">
          <Badge
            variant="secondary"
            className={cn(
              "bg-emerald-100 text-emerald-700",
              imp.ok_count === 0 && "bg-gray-100 text-gray-500",
            )}
          >
            <Check className="mr-0.5 h-3 w-3" strokeWidth={3} /> {imp.ok_count.toLocaleString()}
          </Badge>
        </TableCell>
        <TableCell className="text-right tabular-nums">
          <Badge
            variant="secondary"
            className={cn(
              imp.error_count > 0 ? "bg-rose-100 text-rose-700" : "bg-gray-100 text-gray-500",
            )}
          >
            <X className="mr-0.5 h-3 w-3" strokeWidth={3} /> {imp.error_count.toLocaleString()}
          </Badge>
        </TableCell>
      </TableRow>
      {isOpen && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={8} className="bg-muted/20 p-4">
            <ImportDetail imp={imp} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function ImportDetail({ imp }: { imp: ImportHistoryRow }) {
  const hasFailures = imp.failed_records.length > 0;
  const defaultTab = imp.ok_count > 0 ? "successful" : hasFailures ? "failed" : "successful";

  return (
    <div className="space-y-3">
      {imp.fatal_error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong className="font-semibold">Pipeline aborted: </strong>
            {imp.fatal_error}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {imp.validation_rule_label && (
          <span>
            Validation:{" "}
            <strong className="font-medium text-gray-700">{imp.validation_rule_label}</strong>
          </span>
        )}
        {imp.pipeline_label && (
          <span>
            Pipeline: <strong className="font-medium text-gray-700">{imp.pipeline_label}</strong>
          </span>
        )}
        {imp.stage_label && (
          <span>
            Stage: <strong className="font-medium text-gray-700">{imp.stage_label}</strong>
          </span>
        )}
        <span>
          Duration:{" "}
          <strong className="font-medium text-gray-700">{formatDuration(imp.duration_ms)}</strong>
        </span>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="successful">
            Successful ({imp.successful_records.length.toLocaleString()})
          </TabsTrigger>
          <TabsTrigger value="failed">
            Failed ({imp.failed_records.length.toLocaleString()})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="successful" className="mt-3">
          <SuccessfulTable records={imp.successful_records} />
        </TabsContent>
        <TabsContent value="failed" className="mt-3">
          <FailedTable records={imp.failed_records} importedAt={imp.created_at} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec - min * 60);
  return `${min}m ${rem}s`;
}

function useSearchedPaginated<T>(records: T[], match: (r: T, q: string) => boolean) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => match(r, q));
  }, [records, search, match]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / DETAIL_PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * DETAIL_PAGE_SIZE;
    return filtered.slice(start, start + DETAIL_PAGE_SIZE);
  }, [filtered, page]);

  return { search, setSearch, filtered, pageCount, pageRows, page, setPage };
}

function valuesString(values: Record<string, unknown>): string {
  return Object.entries(values)
    .map(([k, v]) => `${k}: ${v ?? ""}`)
    .join(" ");
}

function downloadFailureCsv(records: FailedHistoryRecord[], importedAt: string) {
  // Build a stable column set: the meta columns up front, then the union of
  // all value keys across failed rows (insertion order).
  const valueKeys: string[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    for (const k of Object.keys(r.values)) {
      if (!seen.has(k)) {
        seen.add(k);
        valueKeys.push(k);
      }
    }
  }

  const rows = records.map((r) => {
    const row: Record<string, string> = {
      source_row: String(r.sourceIndex),
      failed_at_stage: r.stage,
      failure_reason: r.reasons.join("; "),
    };
    for (const k of valueKeys) {
      const v = r.values[k];
      row[k] = v === null || v === undefined ? "" : String(v);
    }
    return row;
  });

  const csv = Papa.unparse({
    fields: ["source_row", "failed_at_stage", "failure_reason", ...valueKeys],
    data: rows.map((r) => [
      r.source_row,
      r.failed_at_stage,
      r.failure_reason,
      ...valueKeys.map((k) => r[k]),
    ]),
  });

  const ts = new Date(importedAt);
  const stamp = isNaN(ts.getTime())
    ? "import"
    : ts.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const filename = `failed-records_${stamp}.csv`;

  // UTF-8 BOM so Excel renders accents correctly.
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function SuccessfulTable({ records }: { records: SuccessfulHistoryRecord[] }) {
  const match = useCallback(
    (r: SuccessfulHistoryRecord, q: string) =>
      String(r.sourceIndex).includes(q) ||
      (r.hubspotId ?? "").toLowerCase().includes(q) ||
      valuesString(r.values).toLowerCase().includes(q),
    [],
  );
  const { search, setSearch, filtered, pageCount, pageRows, page, setPage } = useSearchedPaginated(
    records,
    match,
  );

  if (records.length === 0) {
    return <EmptyHint text="No records were successfully imported in this run." />;
  }

  return (
    <div className="space-y-3">
      <SearchAndCount
        search={search}
        setSearch={setSearch}
        filteredCount={filtered.length}
        totalCount={records.length}
      />
      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-right">#</TableHead>
              <TableHead className="w-48">HubSpot ID</TableHead>
              <TableHead>Values</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                  No records match &ldquo;{search}&rdquo;.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((r) => (
                <TableRow key={r.sourceIndex}>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {r.sourceIndex}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.hubspotId ?? "—"}</TableCell>
                  <TableCell>
                    <ValuesCell values={r.values} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Pagination
        page={page}
        pageCount={pageCount}
        setPage={setPage}
        filteredCount={filtered.length}
      />
    </div>
  );
}

function FailedTable({
  records,
  importedAt,
}: {
  records: FailedHistoryRecord[];
  importedAt: string;
}) {
  const match = useCallback(
    (r: FailedHistoryRecord, q: string) =>
      String(r.sourceIndex).includes(q) ||
      r.stage.toLowerCase().includes(q) ||
      r.reasons.join(" ").toLowerCase().includes(q) ||
      valuesString(r.values).toLowerCase().includes(q),
    [],
  );
  const { search, setSearch, filtered, pageCount, pageRows, page, setPage } = useSearchedPaginated(
    records,
    match,
  );

  if (records.length === 0) {
    return <EmptyHint text="Nothing failed in this run." />;
  }

  const downloadCsv = () => downloadFailureCsv(records, importedAt);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchAndCount
          search={search}
          setSearch={setSearch}
          filteredCount={filtered.length}
          totalCount={records.length}
        />
        <Button variant="outline" size="sm" onClick={downloadCsv}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Download failure CSV
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-right">#</TableHead>
              <TableHead className="w-28">Stage</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Values</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                  No records match &ldquo;{search}&rdquo;.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((r) => (
                <TableRow key={r.sourceIndex}>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {r.sourceIndex}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-gray-100 text-[10px] uppercase">
                      {r.stage}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-rose-700">{r.reasons.join("; ")}</TableCell>
                  <TableCell>
                    <ValuesCell values={r.values} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Pagination
        page={page}
        pageCount={pageCount}
        setPage={setPage}
        filteredCount={filtered.length}
      />
    </div>
  );
}

function ValuesCell({ values }: { values: Record<string, unknown> }) {
  const entries = Object.entries(values).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (entries.length === 0) {
    return <span className="text-xs italic text-muted-foreground">empty</span>;
  }
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
      {entries.map(([k, v]) => (
        <span key={k} className="text-muted-foreground">
          <span className="font-mono text-gray-500">{k}:</span>{" "}
          <span className="text-gray-900">{String(v)}</span>
        </span>
      ))}
    </div>
  );
}

function SearchAndCount({
  search,
  setSearch,
  filteredCount,
  totalCount,
}: {
  search: string;
  setSearch: (v: string) => void;
  filteredCount: number;
  totalCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search records…"
          className="pr-9"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {search.trim()
          ? `${filteredCount.toLocaleString()} of ${totalCount.toLocaleString()}`
          : `${totalCount.toLocaleString()} record${totalCount === 1 ? "" : "s"}`}
      </span>
    </div>
  );
}

function Pagination({
  page,
  pageCount,
  setPage,
  filteredCount,
}: {
  page: number;
  pageCount: number;
  setPage: (updater: (p: number) => number) => void;
  filteredCount: number;
}) {
  if (pageCount <= 1) return null;
  const start = (page - 1) * DETAIL_PAGE_SIZE + 1;
  const end = Math.min(page * DETAIL_PAGE_SIZE, filteredCount);
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">
        Showing {start.toLocaleString()}–{end.toLocaleString()} of {filteredCount.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          Previous
        </Button>
        <span>
          Page {page} of {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          disabled={page === pageCount}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-4 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}
