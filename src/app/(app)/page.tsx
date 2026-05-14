"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  BadgeDollarSign,
  Briefcase,
  Building2,
  Check,
  Cloud,
  Database,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Sliders,
  Sparkles,
  StickyNote,
  Ticket,
  Trash2,
  UploadCloud,
  User,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { HS_OBJECTS, type HsObjectId } from "@/lib/hubspot-objects";
import { type HubspotConnection } from "@/components/hubspot-accounts-panel";
import { validateRowSync, type SavedValidationRule } from "@/lib/validators";
import {
  allRequiredSatisfied,
  checkRequiredHeaders,
  type RequirementStatus,
} from "@/lib/required-headers";
import { PipelineProgress, type StageState } from "@/components/pipeline-progress";
import type {
  PipelineEvent,
  RowResult as PipelineRowResult,
  StageId,
  StageSummary,
} from "@/lib/pipeline/types";

const ACTIVE_RULES_STORAGE_KEY = "datamapr.activeValidationRuleIds";

type StepId = 1 | 2 | 3 | 4;
const STEPS: { id: StepId; label: string }[] = [
  { id: 1, label: "SOURCE" },
  { id: 2, label: "DESTINATION" },
  { id: 3, label: "MAPPING" },
  { id: 4, label: "REVIEW" },
];

type Stage = { id: string; label: string };
type Pipeline = { id: string; label: string; stages: Stage[] };
type SourceId = "csv" | "airtable" | "google_sheets" | "heroku" | "notion" | "pipedrive";
type SavedCredential = {
  id: string;
  source: string;
  label: string;
  config: Record<string, unknown>;
  created_at: string;
};

type SourceOption = {
  id: SourceId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
};

const HS_OBJECT_ICONS: Record<HsObjectId, React.ComponentType<{ className?: string }>> = {
  contacts: User,
  companies: Building2,
  deals: BadgeDollarSign,
  tickets: Ticket,
};

const HS_OBJECT_LABEL_PREFIX: Record<HsObjectId, string> = {
  contacts: "New Contacts",
  companies: "New Companies",
  deals: "New Sales Deals",
  tickets: "New Tickets",
};

const HS_OBJECT_ORDER: HsObjectId[] = ["contacts", "companies", "deals", "tickets"];

const SOURCES: SourceOption[] = [
  {
    id: "csv",
    label: "CSV File",
    description: "Comma-separated values from any tool",
    icon: FileSpreadsheet,
    enabled: true,
  },
  {
    id: "airtable",
    label: "Airtable",
    description: "Connect directly to your Airtable base",
    icon: Database,
    enabled: true,
  },
  {
    id: "google_sheets",
    label: "Google Sheets",
    description: "Import data from a cloud spreadsheet",
    icon: FileText,
    enabled: true,
  },
  {
    id: "heroku",
    label: "Heroku",
    description: "Query a Postgres add-on",
    icon: Cloud,
    enabled: false,
  },
  {
    id: "notion",
    label: "Notion",
    description: "Pull from a database",
    icon: StickyNote,
    enabled: false,
  },
  {
    id: "pipedrive",
    label: "Pipedrive",
    description: "Sync deals or persons",
    icon: Briefcase,
    enabled: false,
  },
];

function toPropertyName(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/'/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^(\d)/, "_$1")
      .slice(0, 100) || "column"
  );
}

type ObjectProperty = { name: string; label: string; type: string; fieldType: string };

type NewPropertyType =
  | "string"
  | "longtext"
  | "number"
  | "date"
  | "datetime"
  | "bool"
  | "enumeration_single"
  | "enumeration_multi";

const NEW_PROPERTY_TYPES: { value: NewPropertyType; label: string; isEnum?: boolean }[] = [
  { value: "string", label: "Single-line text" },
  { value: "longtext", label: "Multi-line text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & time" },
  { value: "bool", label: "Yes / No" },
  { value: "enumeration_single", label: "Dropdown (single select)", isEnum: true },
  { value: "enumeration_multi", label: "Checkboxes (multi select)", isEnum: true },
];

const PROPERTY_NAME_RE = /^[a-z][a-z0-9_]*$/;

function toEnumValue(label: string): string {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 100) || "option"
  );
}

// Mirror of lib/pipeline/normalize.ts for client-side Review preview.
const BOM_RE = new RegExp("^\\uFEFF");

function normalizePreviewValue(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const cleaned = v.replace(BOM_RE, "").trim().replace(/\s+/g, " ");
  if (cleaned === "") return null;
  const lower = cleaned.toLowerCase();
  if (lower === "true") return "true";
  if (lower === "false") return "false";
  return cleaned;
}

function normalizePreviewRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = normalizePreviewValue(v);
  return out;
}

export default function Home() {
  const [currentStep, setCurrentStep] = useState<StepId>(1);
  const [source, setSource] = useState<SourceId>("csv");
  const [objectType, setObjectType] = useState<HsObjectId>("contacts");
  const objectConfig = HS_OBJECTS[objectType];

  // CSV
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Airtable
  const [airtableToken, setAirtableToken] = useState("");
  const [airtableBaseId, setAirtableBaseId] = useState("");
  const [airtableTable, setAirtableTable] = useState("");
  const [airtableLoading, setAirtableLoading] = useState(false);
  const [airtableError, setAirtableError] = useState<string | null>(null);
  const [airtableTables, setAirtableTables] = useState<{ id: string; name: string }[]>([]);
  const [airtableTablesLoading, setAirtableTablesLoading] = useState(false);
  const [airtableTablesError, setAirtableTablesError] = useState<string | null>(null);

  // Google Sheets
  const [gsheetsUrl, setGsheetsUrl] = useState("");
  const [gsheetsLoading, setGsheetsLoading] = useState(false);
  const [gsheetsError, setGsheetsError] = useState<string | null>(null);

  // Saved credentials
  const [savedCreds, setSavedCreds] = useState<SavedCredential[]>([]);
  const [savedCredsLoading, setSavedCredsLoading] = useState(false);
  const [selectedSavedCred, setSelectedSavedCred] = useState<string>("");
  const [saveLabel, setSaveLabel] = useState("");
  const [savingCred, setSavingCred] = useState(false);
  const [credError, setCredError] = useState<string | null>(null);

  // Shared dataset
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);

  // Pipeline run state
  const [running, setRunning] = useState(false);
  const [stageStates, setStageStates] = useState<Partial<Record<StageId, StageState>>>({});
  const [stageSummaries, setStageSummaries] = useState<Partial<Record<StageId, StageSummary>>>({});
  const [stageErrors, setStageErrors] = useState<Partial<Record<StageId, string>>>({});
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [pipelineResults, setPipelineResults] = useState<PipelineRowResult[]>([]);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelinesLoading, setPipelinesLoading] = useState(true);
  const [pipelinesError, setPipelinesError] = useState<string | null>(null);
  const [selectedPipeline, setSelectedPipeline] = useState("");
  const [selectedStage, setSelectedStage] = useState("");

  // HubSpot destination account
  const [hubspotConnections, setHubspotConnections] = useState<HubspotConnection[]>([]);
  const [hubspotConnectionsLoading, setHubspotConnectionsLoading] = useState(true);
  const [selectedHubspotId, setSelectedHubspotId] = useState<string>("");
  const userPickedHubspotRef = useRef(false);

  // Dedup options (sensible defaults, not user-configurable for now)
  const dedupWithinBatch = true;
  const dedupAgainstCrm = true;

  // Active validation rule (read-only here; configured under /settings)
  const [activeRuleIds, setActiveRuleIds] = useState<Partial<Record<HsObjectId, string>>>({});
  const [activeRule, setActiveRule] = useState<SavedValidationRule | null>(null);

  // Mapping step UI
  const [showAllMappings, setShowAllMappings] = useState(false);

  // HubSpot properties for the destination object — drives missing-property detection in Mapping
  const [hubspotProperties, setHubspotProperties] = useState<ObjectProperty[]>([]);
  const [hubspotPropertiesLoading, setHubspotPropertiesLoading] = useState(false);
  const [hubspotPropertiesError, setHubspotPropertiesError] = useState<string | null>(null);

  // Per-source-header overrides: source header → existing HubSpot property name.
  // Set when an auto-create call reuses an existing property due to a label conflict,
  // so the import keys row values to the existing property's internal name.
  const [mappingOverrides, setMappingOverrides] = useState<Record<string, string>>({});

  // Per-row inline edits made in the Review step. Keyed by 1-based source index → source header → value.
  // Stored against source headers so they merge cleanly back into the rows sent to the pipeline.
  const [editedValues, setEditedValues] = useState<Record<number, Record<string, unknown>>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(ACTIVE_RULES_STORAGE_KEY);
      if (raw) setActiveRuleIds(JSON.parse(raw));
    } catch {
      // ignore corrupted storage
    }
  }, []);

  const loadHubspotConnections = useCallback(async () => {
    setHubspotConnectionsLoading(true);
    try {
      const res = await fetch("/api/hubspot-connection");
      const data = (await res.json()) as {
        ok: boolean;
        connections?: HubspotConnection[];
      };
      const list = data.ok ? (data.connections ?? []) : [];
      setHubspotConnections(list);
      setSelectedHubspotId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        userPickedHubspotRef.current = false;
        const def = list.find((c) => c.isDefault);
        return def?.id ?? list[0]?.id ?? "";
      });
    } catch {
      setHubspotConnections([]);
      setSelectedHubspotId("");
    } finally {
      setHubspotConnectionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHubspotConnections();
  }, [loadHubspotConnections]);

  const loadHubspotProperties = useCallback(async () => {
    if (!selectedHubspotId) {
      setHubspotProperties([]);
      setHubspotPropertiesError(null);
      return;
    }
    setHubspotPropertiesLoading(true);
    setHubspotPropertiesError(null);
    try {
      const params = new URLSearchParams({
        objectType,
        hubspotConnectionId: selectedHubspotId,
      });
      const res = await fetch(`/api/object-properties?${params.toString()}`);
      const data = (await res.json()) as {
        ok: boolean;
        properties?: ObjectProperty[];
        error?: string;
      };
      if (!data.ok) {
        setHubspotPropertiesError(data.error ?? `HTTP ${res.status}`);
        setHubspotProperties([]);
        return;
      }
      setHubspotProperties(data.properties ?? []);
    } catch (err) {
      setHubspotPropertiesError((err as Error).message);
      setHubspotProperties([]);
    } finally {
      setHubspotPropertiesLoading(false);
    }
  }, [objectType, selectedHubspotId]);

  useEffect(() => {
    loadHubspotProperties();
  }, [loadHubspotProperties]);

  const handlePropertyCreated = useCallback((property: ObjectProperty) => {
    setHubspotProperties((prev) =>
      prev.some((p) => p.name === property.name)
        ? prev.map((p) => (p.name === property.name ? property : p))
        : [...prev, property].sort((a, b) => a.label.localeCompare(b.label)),
    );
  }, []);

  const handleHubspotSelect = (id: string) => {
    userPickedHubspotRef.current = true;
    setSelectedHubspotId(id);
  };

  const persistActiveRuleIds = (next: Partial<Record<HsObjectId, string>>) => {
    setActiveRuleIds(next);
    try {
      window.localStorage.setItem(ACTIVE_RULES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
  };

  useEffect(() => {
    const id = activeRuleIds[objectType];
    if (!id) {
      setActiveRule(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/validation-rules?object_type=${objectType}`)
      .then((r) => r.json())
      .then((data: { ok: boolean; rules?: SavedValidationRule[] }) => {
        if (cancelled) return;
        const match = data.ok ? data.rules?.find((r) => r.id === id) : undefined;
        if (!match) {
          setActiveRule(null);
          const next = { ...activeRuleIds };
          delete next[objectType];
          persistActiveRuleIds(next);
          return;
        }
        setActiveRule(match);
      })
      .catch(() => {
        if (!cancelled) setActiveRule(null);
      });
    return () => {
      cancelled = true;
    };
  }, [objectType, activeRuleIds]);

  useEffect(() => {
    if (!objectConfig.supportsPipeline) {
      setPipelines([]);
      setSelectedPipeline("");
      setSelectedStage("");
      setPipelinesError(null);
      setPipelinesLoading(false);
      return;
    }
    if (!selectedHubspotId) {
      setPipelines([]);
      setSelectedPipeline("");
      setSelectedStage("");
      setPipelinesError(null);
      setPipelinesLoading(false);
      return;
    }
    setPipelinesLoading(true);
    setPipelinesError(null);
    const params = new URLSearchParams({
      objectType,
      hubspotConnectionId: selectedHubspotId,
    });
    fetch(`/api/pipelines?${params.toString()}`)
      .then((r) => r.json())
      .then((data: { ok: boolean; pipelines?: Pipeline[]; error?: string }) => {
        if (data.ok && data.pipelines?.length) {
          setPipelines(data.pipelines);
          setSelectedPipeline(data.pipelines[0].id);
          setSelectedStage(data.pipelines[0].stages[0]?.id ?? "");
        } else if (data.ok) {
          setPipelines([]);
          setSelectedPipeline("");
          setSelectedStage("");
        } else {
          setPipelinesError(data.error ?? "Failed to load pipelines.");
        }
      })
      .catch((err: Error) => setPipelinesError(err.message))
      .finally(() => setPipelinesLoading(false));
  }, [objectType, objectConfig.supportsPipeline, selectedHubspotId]);

  const currentStages = useMemo(
    () => pipelines.find((p) => p.id === selectedPipeline)?.stages ?? [],
    [pipelines, selectedPipeline],
  );

  const handlePipelineChange = (id: string) => {
    setSelectedPipeline(id);
    const first = pipelines.find((p) => p.id === id)?.stages[0];
    setSelectedStage(first?.id ?? "");
  };

  const resetPipelineState = () => {
    setStageStates({});
    setStageSummaries({});
    setStageErrors({});
    setImportProgress(null);
    setPipelineResults([]);
    setFatalError(null);
  };

  const resetDataset = () => {
    setRows([]);
    setHeaders([]);
    setMappingOverrides({});
    setEditedValues({});
    resetPipelineState();
  };

  const handleSourceChange = (id: SourceId) => {
    if (id === source) return;
    setSource(id);
    setFile(null);
    setAirtableError(null);
    setSelectedSavedCred("");
    setCredError(null);
    setGsheetsError(null);
    resetDataset();
  };

  const loadGoogleSheets = async () => {
    if (!gsheetsUrl.trim()) return;
    setGsheetsLoading(true);
    setGsheetsError(null);
    resetDataset();
    try {
      const res = await fetch("/api/google-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: gsheetsUrl.trim() }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        headers?: string[];
        rows?: Record<string, unknown>[];
        error?: string;
      };
      if (!data.ok) {
        setGsheetsError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setHeaders(data.headers ?? []);
      setRows(data.rows ?? []);
    } catch (err) {
      setGsheetsError((err as Error).message);
    } finally {
      setGsheetsLoading(false);
    }
  };

  const loadSavedCreds = useCallback(async (sourceId: SourceId) => {
    setSavedCredsLoading(true);
    setCredError(null);
    try {
      const res = await fetch(`/api/credentials?source=${sourceId}`);
      const data = (await res.json()) as {
        ok: boolean;
        credentials?: SavedCredential[];
        error?: string;
      };
      if (data.ok) {
        setSavedCreds(data.credentials ?? []);
      } else {
        setCredError(data.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setCredError((err as Error).message);
    } finally {
      setSavedCredsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (source === "airtable") {
      loadSavedCreds("airtable");
    } else {
      setSavedCreds([]);
      setSelectedSavedCred("");
    }
  }, [source, loadSavedCreds]);

  const loadAirtableTables = useCallback(async (token: string, baseId: string) => {
    if (!token.trim() || !baseId.trim()) return;
    setAirtableTablesLoading(true);
    setAirtableTablesError(null);
    try {
      const res = await fetch("/api/airtable/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, baseId }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        tables?: { id: string; name: string }[];
        error?: string;
      };
      if (!data.ok) {
        setAirtableTablesError(data.error ?? `HTTP ${res.status}`);
        setAirtableTables([]);
        return;
      }
      setAirtableTables(data.tables ?? []);
    } catch (err) {
      setAirtableTablesError((err as Error).message);
      setAirtableTables([]);
    } finally {
      setAirtableTablesLoading(false);
    }
  }, []);

  const applySavedCred = (id: string) => {
    setSelectedSavedCred(id);
    if (!id) return;
    const cred = savedCreds.find((c) => c.id === id);
    if (!cred) return;
    if (source === "airtable") {
      const cfg = cred.config as { token?: string; baseId?: string; table?: string };
      setAirtableToken(cfg.token ?? "");
      setAirtableBaseId(cfg.baseId ?? "");
      setAirtableTable(cfg.table ?? "");
      setAirtableError(null);
      if (cfg.token && cfg.baseId) loadAirtableTables(cfg.token, cfg.baseId);
    }
  };

  const saveCurrentCred = async () => {
    if (source !== "airtable") return;
    if (!saveLabel.trim() || !airtableToken || !airtableBaseId || !airtableTable) return;
    setSavingCred(true);
    setCredError(null);
    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "airtable",
          label: saveLabel.trim(),
          config: {
            token: airtableToken,
            baseId: airtableBaseId,
            table: airtableTable,
          },
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        credential?: SavedCredential;
        error?: string;
      };
      if (!data.ok || !data.credential) {
        setCredError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSavedCreds((prev) => [data.credential!, ...prev]);
      setSelectedSavedCred(data.credential.id);
      setSaveLabel("");
    } catch (err) {
      setCredError((err as Error).message);
    } finally {
      setSavingCred(false);
    }
  };

  const deleteSavedCred = async (id: string) => {
    setCredError(null);
    try {
      const res = await fetch(`/api/credentials?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setCredError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSavedCreds((prev) => prev.filter((c) => c.id !== id));
      if (selectedSavedCred === id) setSelectedSavedCred("");
    } catch (err) {
      setCredError((err as Error).message);
    }
  };

  const handleFile = useCallback((f: File) => {
    setFile(f);
    resetPipelineState();
    Papa.parse<Record<string, unknown>>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setRows(res.data);
        setHeaders(res.meta.fields ?? []);
      },
    });
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const loadAirtable = async () => {
    if (!airtableToken || !airtableBaseId || !airtableTable) return;
    setAirtableLoading(true);
    setAirtableError(null);
    resetDataset();
    try {
      const res = await fetch("/api/airtable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: airtableToken,
          baseId: airtableBaseId,
          table: airtableTable,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        headers?: string[];
        rows?: Record<string, unknown>[];
        error?: string;
      };
      if (!data.ok) {
        setAirtableError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setHeaders(data.headers ?? []);
      setRows(data.rows ?? []);
    } catch (err) {
      setAirtableError((err as Error).message);
    } finally {
      setAirtableLoading(false);
    }
  };

  const startImport = async () => {
    if (!rows.length || running) return;
    if (objectConfig.supportsPipeline && !selectedStage) return;
    if (!selectedHubspotId) return;

    setRunning(true);
    resetPipelineState();

    // Apply per-source overrides so reused HubSpot properties (e.g. firstname instead
    // of first_name) receive the column data. Without this, the runner would use
    // toPropertyName(header) and miss the override. Also fold in Review-step edits.
    const hasOverrides = Object.keys(mappingOverrides).length > 0;
    const hasEdits = Object.keys(editedValues).length > 0;
    const effectiveHeaders = hasOverrides ? headers.map((h) => mappingOverrides[h] ?? h) : headers;
    const effectiveRows =
      hasOverrides || hasEdits
        ? rows.map((row, i) => {
            const edits = editedValues[i + 1];
            const merged = edits ? { ...row, ...edits } : row;
            if (!hasOverrides) return merged;
            const next: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(merged)) {
              next[mappingOverrides[k] ?? k] = v;
            }
            return next;
          })
        : rows;

    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: effectiveRows,
          headers: effectiveHeaders,
          objectType,
          pipelineId: selectedPipeline || undefined,
          stageId: selectedStage || undefined,
          validationRuleId: activeRule?.id ?? null,
          dedupOptions: { withinBatch: dedupWithinBatch, againstCrm: dedupAgainstCrm },
          hubspotConnectionId: selectedHubspotId || null,
          // Snapshots stored on the import_history row for the History page.
          sourceLabel: SOURCES.find((s) => s.id === source)?.label ?? source,
          hubspotConnectionLabel:
            hubspotConnections.find((c) => c.id === selectedHubspotId)?.label ?? null,
          pipelineLabel: pipelines.find((p) => p.id === selectedPipeline)?.label ?? null,
          stageLabel: currentStages.find((s) => s.id === selectedStage)?.label ?? null,
          validationRuleLabel: activeRule?.label ?? null,
        }),
      });
      if (!res.ok || !res.body) {
        setFatalError(`Pipeline request failed: HTTP ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep = buffer.indexOf("\n\n");
        while (sep !== -1) {
          const block = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          sep = buffer.indexOf("\n\n");
          for (const line of block.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6);
            try {
              const event = JSON.parse(payload) as PipelineEvent | { type: "fatal"; error: string };
              handlePipelineEvent(event);
            } catch {
              // ignore malformed event
            }
          }
        }
      }
    } catch (err) {
      setFatalError((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const handlePipelineEvent = (event: PipelineEvent | { type: "fatal"; error: string }) => {
    switch (event.type) {
      case "stage:start":
        setStageStates((s) => ({ ...s, [event.stage]: "running" }));
        return;
      case "stage:done":
        setStageStates((s) => ({ ...s, [event.summary.stage]: "done" }));
        setStageSummaries((s) => ({ ...s, [event.summary.stage]: event.summary }));
        return;
      case "stage:error":
        setStageStates((s) => ({ ...s, [event.stage]: "error" }));
        setStageErrors((s) => ({ ...s, [event.stage]: event.error }));
        return;
      case "progress":
        setImportProgress({ current: event.current, total: event.total });
        return;
      case "row":
        setPipelineResults((r) => [...r, event.result]);
        return;
      case "done":
        return;
      case "fatal":
        setFatalError(event.error);
        return;
    }
  };

  const importSummary = useMemo(() => {
    const ok = pipelineResults.filter((r) => r.status === "ok").length;
    const err = pipelineResults.filter((r) => r.status === "error").length;
    return { ok, err };
  }, [pipelineResults]);

  // ----- Step gating -----
  const dataLoaded = rows.length > 0 && headers.length > 0;
  const canAdvanceFromStep2 = !!objectType && !!selectedHubspotId;

  // Required-header preflight: at least one source column must map to each
  // object's identifier property (email for contacts, etc.) or the import
  // will produce undeduplicatable junk.
  const requirementStatuses = useMemo<RequirementStatus[]>(() => {
    if (!dataLoaded) return [];
    const mapped = headers.map((h) => ({
      source: h,
      target: mappingOverrides[h] ?? toPropertyName(h),
    }));
    return checkRequiredHeaders(objectType, mapped);
  }, [dataLoaded, objectType, headers, mappingOverrides]);
  const requirementsOk = allRequiredSatisfied(requirementStatuses);

  const canAdvanceFromStep3 = (!objectConfig.supportsPipeline || !!selectedStage) && requirementsOk;
  const canTrigger =
    !running &&
    dataLoaded &&
    !!selectedHubspotId &&
    (!objectConfig.supportsPipeline || !!selectedStage) &&
    requirementsOk;

  const goToStep = (step: StepId) => {
    if (step === currentStep) return;
    // Only allow navigating forward to a step whose prerequisites are satisfied.
    if (step > currentStep) {
      if (step >= 2 && !dataLoaded) return;
      if (step >= 3 && !canAdvanceFromStep2) return;
      if (step >= 4 && !canAdvanceFromStep3) return;
    }
    setCurrentStep(step);
  };

  // ----- Mapping preview -----
  const mappings = useMemo(
    () =>
      headers.map((h) => {
        const derived = toPropertyName(h);
        const override = mappingOverrides[h];
        return {
          source: h,
          target: override ?? derived,
          reusedFrom: override && override !== derived ? derived : null,
        };
      }),
    [headers, mappingOverrides],
  );

  // Derive what the user will actually migrate: normalize + validate + map + edits applied.
  // Mirrors the server pipeline closely (minus dedup, which requires HubSpot calls).
  const previewData = useMemo(() => {
    const targetByHeader: Record<string, string> = {};
    for (const h of headers) targetByHeader[h] = mappingOverrides[h] ?? toPropertyName(h);

    const seen = new Set<string>();
    const columnOrder: string[] = [];
    for (const h of headers) {
      const t = targetByHeader[h];
      if (!seen.has(t)) {
        seen.add(t);
        columnOrder.push(t);
      }
    }

    const previewRows: { sourceIndex: number; values: Record<string, unknown> }[] = [];
    let invalidCount = 0;
    for (let i = 0; i < rows.length; i++) {
      const sourceIndex = i + 1;
      const edits = editedValues[sourceIndex];
      const applied = edits ? { ...rows[i], ...edits } : rows[i];
      const normalized = normalizePreviewRow(applied);
      if (activeRule?.rules) {
        const result = validateRowSync(normalized, activeRule.rules);
        if (!result.valid) {
          invalidCount++;
          continue;
        }
      }
      const mapped: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(normalized)) {
        mapped[targetByHeader[k] ?? k] = v;
      }
      previewRows.push({ sourceIndex, values: mapped });
    }

    return { rows: previewRows, invalidCount, columns: columnOrder };
  }, [rows, headers, mappingOverrides, activeRule, editedValues]);

  const handleCellEdit = useCallback(
    (sourceIndex: number, targetKey: string, value: unknown) => {
      // Translate target → source header so edits merge into the rows we send to the pipeline.
      let sourceKey: string | null = null;
      for (const h of headers) {
        if ((mappingOverrides[h] ?? toPropertyName(h)) === targetKey) {
          sourceKey = h;
          break;
        }
      }
      if (!sourceKey) return;
      const finalKey = sourceKey;
      setEditedValues((prev) => {
        const rowEdits = { ...(prev[sourceIndex] ?? {}) };
        const original = rows[sourceIndex - 1]?.[finalKey];
        // If the user reverted to the original value, drop the edit to keep state clean.
        if (Object.is(value, original)) {
          delete rowEdits[finalKey];
          if (Object.keys(rowEdits).length === 0) {
            const next = { ...prev };
            delete next[sourceIndex];
            return next;
          }
        } else {
          rowEdits[finalKey] = value;
        }
        return { ...prev, [sourceIndex]: rowEdits };
      });
    },
    [headers, mappingOverrides, rows],
  );

  const selectedSourceLabel = SOURCES.find((s) => s.id === source)?.label ?? source;
  const selectedHubspotName =
    hubspotConnections.find((c) => c.id === selectedHubspotId)?.label ?? null;
  const selectedPipelineName = pipelines.find((p) => p.id === selectedPipeline)?.label ?? null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <StepIndicator current={currentStep} onClickStep={goToStep} />

      {currentStep === 1 && (
        <SourceStep
          source={source}
          onSelectSource={handleSourceChange}
          dataLoaded={dataLoaded}
          rows={rows}
          headers={headers}
          /* CSV */
          file={file}
          inputRef={inputRef}
          onDrop={onDrop}
          onFileChange={handleFile}
          /* Airtable */
          airtableToken={airtableToken}
          setAirtableToken={setAirtableToken}
          airtableBaseId={airtableBaseId}
          setAirtableBaseId={setAirtableBaseId}
          airtableTable={airtableTable}
          setAirtableTable={setAirtableTable}
          airtableTables={airtableTables}
          setAirtableTables={setAirtableTables}
          airtableTablesLoading={airtableTablesLoading}
          airtableTablesError={airtableTablesError}
          setAirtableTablesError={setAirtableTablesError}
          loadAirtableTables={loadAirtableTables}
          airtableLoading={airtableLoading}
          airtableError={airtableError}
          loadAirtable={loadAirtable}
          /* Google Sheets */
          gsheetsUrl={gsheetsUrl}
          setGsheetsUrl={setGsheetsUrl}
          gsheetsLoading={gsheetsLoading}
          gsheetsError={gsheetsError}
          loadGoogleSheets={loadGoogleSheets}
          /* saved creds */
          savedCreds={savedCreds}
          savedCredsLoading={savedCredsLoading}
          selectedSavedCred={selectedSavedCred}
          applySavedCred={applySavedCred}
          deleteSavedCred={deleteSavedCred}
          saveLabel={saveLabel}
          setSaveLabel={setSaveLabel}
          savingCred={savingCred}
          saveCurrentCred={saveCurrentCred}
          credError={credError}
          onContinue={() => setCurrentStep(2)}
        />
      )}

      {currentStep === 2 && (
        <DestinationStep
          objectType={objectType}
          onSelectObject={(id) => {
            if (objectType !== id) {
              setObjectType(id);
              resetPipelineState();
            }
          }}
          hubspotConnections={hubspotConnections}
          hubspotConnectionsLoading={hubspotConnectionsLoading}
          selectedHubspotId={selectedHubspotId}
          onSelectHubspot={handleHubspotSelect}
          onBack={() => setCurrentStep(1)}
          onContinue={() => setCurrentStep(3)}
          canContinue={canAdvanceFromStep2}
        />
      )}

      {currentStep === 3 && (
        <MappingStep
          mappings={mappings}
          showAllMappings={showAllMappings}
          setShowAllMappings={setShowAllMappings}
          rows={rows}
          headers={headers}
          objectConfig={objectConfig}
          objectType={objectType}
          pipelines={pipelines}
          pipelinesLoading={pipelinesLoading}
          pipelinesError={pipelinesError}
          selectedPipeline={selectedPipeline}
          selectedStage={selectedStage}
          currentStages={currentStages}
          onPipelineChange={handlePipelineChange}
          onStageChange={setSelectedStage}
          activeRule={activeRule}
          hubspotConnectionId={selectedHubspotId}
          hubspotProperties={hubspotProperties}
          hubspotPropertiesLoading={hubspotPropertiesLoading}
          hubspotPropertiesError={hubspotPropertiesError}
          onReloadHubspotProperties={loadHubspotProperties}
          onPropertyCreated={handlePropertyCreated}
          onMappingOverride={(sourceHeader, propertyName) =>
            setMappingOverrides((prev) => ({ ...prev, [sourceHeader]: propertyName }))
          }
          requirementStatuses={requirementStatuses}
          onBack={() => setCurrentStep(2)}
          onContinue={() => setCurrentStep(4)}
          canContinue={canAdvanceFromStep3}
        />
      )}

      {currentStep === 4 && (
        <ReviewStep
          rows={rows}
          objectConfig={objectConfig}
          selectedSourceLabel={selectedSourceLabel}
          selectedHubspotName={selectedHubspotName}
          selectedPipelineName={selectedPipelineName}
          activeRule={activeRule}
          previewRows={previewData.rows}
          previewColumns={previewData.columns}
          previewInvalidCount={previewData.invalidCount}
          hubspotProperties={hubspotProperties}
          editedValues={editedValues}
          onCellEdit={handleCellEdit}
          onBack={() => setCurrentStep(3)}
          startImport={startImport}
          canTrigger={canTrigger}
          running={running}
          stageStates={stageStates}
          stageSummaries={stageSummaries}
          stageErrors={stageErrors}
          importProgress={importProgress}
          fatalError={fatalError}
          importSummary={importSummary}
        />
      )}
    </div>
  );
}

// =====================================================================
// Step indicator
// =====================================================================

function StepIndicator({
  current,
  onClickStep,
}: {
  current: StepId;
  onClickStep: (step: StepId) => void;
}) {
  return (
    <div className="mb-14 flex items-start justify-center px-2">
      {STEPS.map((step, i) => {
        const isComplete = step.id < current;
        const isCurrent = step.id === current;
        const isLast = i === STEPS.length - 1;
        return (
          <Fragment key={step.id}>
            <button
              type="button"
              onClick={() => onClickStep(step.id)}
              className="flex flex-col items-center"
            >
              <div
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
                  isComplete && "border-emerald-500 bg-emerald-500 text-white",
                  isCurrent && "border-emerald-500 bg-white text-emerald-600",
                  !isComplete && !isCurrent && "border-gray-200 bg-white text-gray-400",
                )}
              >
                {isComplete ? <Check className="h-5 w-5" strokeWidth={3} /> : step.id}
              </div>
              <span
                className={cn(
                  "mt-2 text-[11px] font-semibold uppercase tracking-wider",
                  isComplete || isCurrent ? "text-emerald-600" : "text-gray-400",
                )}
              >
                {step.label}
              </span>
            </button>
            {!isLast && (
              <div
                className={cn(
                  "mx-2 mt-[22px] h-px flex-1 transition-colors",
                  isComplete ? "bg-emerald-500" : "bg-gray-200",
                )}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

// =====================================================================
// Step 1 — Source
// =====================================================================

type SourceStepProps = {
  source: SourceId;
  onSelectSource: (id: SourceId) => void;
  dataLoaded: boolean;
  rows: Record<string, unknown>[];
  headers: string[];
  file: File | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onDrop: (e: React.DragEvent) => void;
  onFileChange: (f: File) => void;
  airtableToken: string;
  setAirtableToken: (v: string) => void;
  airtableBaseId: string;
  setAirtableBaseId: (v: string) => void;
  airtableTable: string;
  setAirtableTable: (v: string) => void;
  airtableTables: { id: string; name: string }[];
  setAirtableTables: (v: { id: string; name: string }[]) => void;
  airtableTablesLoading: boolean;
  airtableTablesError: string | null;
  setAirtableTablesError: (v: string | null) => void;
  loadAirtableTables: (token: string, baseId: string) => void;
  airtableLoading: boolean;
  airtableError: string | null;
  loadAirtable: () => void;
  gsheetsUrl: string;
  setGsheetsUrl: (v: string) => void;
  gsheetsLoading: boolean;
  gsheetsError: string | null;
  loadGoogleSheets: () => void;
  savedCreds: SavedCredential[];
  savedCredsLoading: boolean;
  selectedSavedCred: string;
  applySavedCred: (id: string) => void;
  deleteSavedCred: (id: string) => void;
  saveLabel: string;
  setSaveLabel: (v: string) => void;
  savingCred: boolean;
  saveCurrentCred: () => void;
  credError: string | null;
  onContinue: () => void;
};

function SourceStep(props: SourceStepProps) {
  const {
    source,
    onSelectSource,
    dataLoaded,
    rows,
    headers,
    file,
    inputRef,
    onDrop,
    onFileChange,
    onContinue,
  } = props;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {SOURCES.map((s) => {
          const Icon = s.icon;
          const isActive = source === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => s.enabled && onSelectSource(s.id)}
              disabled={!s.enabled}
              className={cn(
                "relative flex flex-col items-start gap-4 rounded-2xl border-2 p-6 text-left transition-all",
                isActive
                  ? "border-emerald-500 bg-emerald-50/50 shadow-sm"
                  : "border-gray-200 bg-white hover:border-gray-300",
                !s.enabled && "cursor-not-allowed opacity-50 hover:border-gray-200",
              )}
            >
              {isActive && (
                <div className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500">
                  <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                </div>
              )}
              {!s.enabled && (
                <Badge
                  variant="secondary"
                  className="absolute right-3 top-3 bg-gray-100 text-[10px] uppercase text-gray-500"
                >
                  Soon
                </Badge>
              )}
              <div
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-xl",
                  isActive ? "bg-emerald-100" : "bg-gray-100",
                )}
              >
                <Icon className={cn("h-6 w-6", isActive ? "text-emerald-600" : "text-gray-600")} />
              </div>
              <div>
                <p className="text-base font-bold text-gray-900">{s.label}</p>
                <p className="mt-0.5 text-sm text-gray-500">{s.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {source === "csv" && (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white p-12 text-center transition-colors hover:border-emerald-500/60 hover:bg-emerald-50/30"
        >
          <UploadCloud className="mb-3 h-10 w-10 text-gray-400" />
          <p className="font-medium text-gray-900">
            {file ? file.name : "Click or drag a CSV file here"}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {file ? `${rows.length} rows · ${headers.length} columns` : ".csv files only"}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFileChange(f);
            }}
          />
        </div>
      )}

      {source === "airtable" && <AirtableLoader {...props} />}

      {source === "google_sheets" && <GoogleSheetsLoader {...props} />}

      <div className="flex justify-end pt-4">
        <Button
          onClick={onContinue}
          disabled={!dataLoaded}
          size="lg"
          className="bg-gray-900 px-8 text-white hover:bg-gray-800"
        >
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function AirtableLoader(props: SourceStepProps) {
  const {
    airtableToken,
    setAirtableToken,
    airtableBaseId,
    setAirtableBaseId,
    airtableTable,
    setAirtableTable,
    airtableTables,
    setAirtableTables,
    airtableTablesLoading,
    airtableTablesError,
    setAirtableTablesError,
    loadAirtableTables,
    airtableLoading,
    airtableError,
    loadAirtable,
    rows,
    headers,
    savedCreds,
    savedCredsLoading,
    selectedSavedCred,
    applySavedCred,
    deleteSavedCred,
    saveLabel,
    setSaveLabel,
    savingCred,
    saveCurrentCred,
    credError,
  } = props;

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
      {(savedCreds.length > 0 || savedCredsLoading) && (
        <div className="space-y-1.5 rounded-md border border-gray-200 bg-gray-50/50 p-3">
          <Label htmlFor="at-saved">Saved connections</Label>
          <div className="flex items-center gap-2">
            <Select
              value={selectedSavedCred}
              onValueChange={applySavedCred}
              disabled={savedCredsLoading || savedCreds.length === 0}
            >
              <SelectTrigger id="at-saved" className="flex-1">
                <SelectValue
                  placeholder={savedCredsLoading ? "Loading…" : "Select a saved connection"}
                />
              </SelectTrigger>
              <SelectContent>
                {savedCreds.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedSavedCred && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => deleteSavedCred(selectedSavedCred)}
                title="Delete saved connection"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="at-token">Personal access token</Label>
          <Input
            id="at-token"
            type="password"
            placeholder="pat••••••••••••••••"
            value={airtableToken}
            onChange={(e) => {
              setAirtableToken(e.target.value);
              setAirtableTables([]);
              setAirtableTable("");
              setAirtableTablesError(null);
            }}
            autoComplete="off"
          />
          <p className="text-xs text-gray-500">
            Create one at airtable.com/create/tokens with{" "}
            <code className="rounded bg-gray-100 px-1">data.records:read</code> and{" "}
            <code className="rounded bg-gray-100 px-1">schema.bases:read</code> scopes.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="at-base">Base ID</Label>
          <Input
            id="at-base"
            placeholder="appXXXXXXXXXXXXXX"
            value={airtableBaseId}
            onChange={(e) => {
              setAirtableBaseId(e.target.value);
              setAirtableTables([]);
              setAirtableTable("");
              setAirtableTablesError(null);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="at-table">Table</Label>
          <div className="flex items-center gap-2">
            <Select
              value={airtableTable}
              onValueChange={setAirtableTable}
              disabled={airtableTables.length === 0}
            >
              <SelectTrigger id="at-table" className="flex-1">
                <SelectValue
                  placeholder={
                    airtableTablesLoading
                      ? "Loading tables…"
                      : airtableTables.length === 0
                        ? "Refresh to list tables"
                        : "Select a table"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {airtableTables.map((t) => (
                  <SelectItem key={t.id} value={t.name}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => loadAirtableTables(airtableToken, airtableBaseId)}
              disabled={airtableTablesLoading || !airtableToken.trim() || !airtableBaseId.trim()}
              title="Refresh table list"
            >
              {airtableTablesLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
          {airtableTablesError && <p className="text-xs text-destructive">{airtableTablesError}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={loadAirtable}
          disabled={airtableLoading || !airtableToken || !airtableBaseId || !airtableTable}
        >
          {airtableLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </>
          ) : (
            <>Load from Airtable</>
          )}
        </Button>
        {rows.length > 0 && !airtableLoading && (
          <p className="text-sm text-gray-500">
            Loaded {rows.length} rows · {headers.length} columns
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-dashed border-gray-200 p-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="at-save-label">Save this connection</Label>
          <Input
            id="at-save-label"
            placeholder="e.g. Acme Q2 deals"
            value={saveLabel}
            onChange={(e) => setSaveLabel(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          onClick={saveCurrentCred}
          disabled={
            savingCred || !saveLabel.trim() || !airtableToken || !airtableBaseId || !airtableTable
          }
        >
          {savingCred ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" /> Save
            </>
          )}
        </Button>
      </div>

      {airtableError && <p className="text-sm text-destructive">{airtableError}</p>}
      {credError && <p className="text-sm text-destructive">{credError}</p>}
    </div>
  );
}

function GoogleSheetsLoader(props: SourceStepProps) {
  const {
    gsheetsUrl,
    setGsheetsUrl,
    gsheetsLoading,
    gsheetsError,
    loadGoogleSheets,
    rows,
    headers,
  } = props;

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
      <div className="space-y-1.5">
        <Label htmlFor="gs-url">Google Sheets URL</Label>
        <Input
          id="gs-url"
          type="url"
          placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0"
          value={gsheetsUrl}
          onChange={(e) => setGsheetsUrl(e.target.value)}
          autoComplete="off"
        />
        <p className="text-xs text-gray-500">
          The sheet must be shared as{" "}
          <strong className="font-medium">&ldquo;Anyone with the link&rdquo;</strong> (Viewer). If a
          specific tab is open, its <code className="rounded bg-gray-100 px-1">gid</code> in the URL
          will be used; otherwise the first tab is imported.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={loadGoogleSheets} disabled={gsheetsLoading || !gsheetsUrl.trim()}>
          {gsheetsLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </>
          ) : (
            <>Load from Google Sheets</>
          )}
        </Button>
        {rows.length > 0 && !gsheetsLoading && (
          <p className="text-sm text-gray-500">
            Loaded {rows.length} rows · {headers.length} columns
          </p>
        )}
      </div>

      {gsheetsError && <p className="text-sm text-destructive">{gsheetsError}</p>}
    </div>
  );
}

// =====================================================================
// Step 2 — Destination
// =====================================================================

type DestinationStepProps = {
  objectType: HsObjectId;
  onSelectObject: (id: HsObjectId) => void;
  hubspotConnections: HubspotConnection[];
  hubspotConnectionsLoading: boolean;
  selectedHubspotId: string;
  onSelectHubspot: (id: string) => void;
  onBack: () => void;
  onContinue: () => void;
  canContinue: boolean;
};

function DestinationStep({
  objectType,
  onSelectObject,
  hubspotConnections,
  hubspotConnectionsLoading,
  selectedHubspotId,
  onSelectHubspot,
  onBack,
  onContinue,
  canContinue,
}: DestinationStepProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">I want to create...</h2>

      <div className="space-y-3">
        {HS_OBJECT_ORDER.map((id) => {
          const obj = HS_OBJECTS[id];
          const Icon = HS_OBJECT_ICONS[id];
          const isActive = objectType === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectObject(id)}
              className={cn(
                "flex w-full items-center gap-4 rounded-2xl border-2 p-5 text-left transition-all",
                isActive
                  ? "border-emerald-500 bg-emerald-50/40"
                  : "border-gray-200 bg-white hover:border-gray-300",
              )}
            >
              <div
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-xl",
                  isActive ? "bg-emerald-100" : "bg-gray-100",
                )}
              >
                <Icon className={cn("h-6 w-6", isActive ? "text-emerald-600" : "text-gray-600")} />
              </div>
              <div className="flex-1">
                <p className="text-base font-bold text-gray-900">{HS_OBJECT_LABEL_PREFIX[id]}</p>
                <p className="text-sm text-gray-500">{obj.description}</p>
              </div>
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border-2",
                  isActive ? "border-emerald-500 bg-emerald-500" : "border-gray-300 bg-white",
                )}
              >
                {isActive && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="mb-4">
          <h3 className="text-base font-bold text-gray-900">HubSpot account</h3>
          <p className="text-sm text-gray-500">
            Which connected portal should these records be imported into?
          </p>
        </div>
        {hubspotConnectionsLoading ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </p>
        ) : hubspotConnections.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">
            No HubSpot accounts connected yet.{" "}
            <Link href="/hubspot-accounts" className="font-medium text-emerald-600 underline">
              Add one on the HubSpot accounts page
            </Link>
            .
          </p>
        ) : (
          <Select value={selectedHubspotId} onValueChange={onSelectHubspot}>
            <SelectTrigger>
              <SelectValue placeholder="Select a HubSpot account" />
            </SelectTrigger>
            <SelectContent>
              {hubspotConnections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">
                    <span>{c.label}</span>
                    {c.portalId && (
                      <span className="text-xs text-gray-500">
                        · Portal {c.portalId}
                        {c.uiDomain ? ` (${c.uiDomain})` : ""}
                      </span>
                    )}
                    {c.isDefault && (
                      <Badge
                        variant="secondary"
                        className="ml-1 bg-emerald-100 text-[10px] uppercase text-emerald-700"
                      >
                        Default
                      </Badge>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex items-center justify-between pt-4">
        <Button variant="ghost" onClick={onBack} className="text-gray-600">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onContinue}
          disabled={!canContinue}
          size="lg"
          className="bg-gray-900 px-8 text-white hover:bg-gray-800"
        >
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// =====================================================================
// Step 3 — Mapping
// =====================================================================

type Mapping = { source: string; target: string; reusedFrom: string | null };

type MappingStepProps = {
  mappings: Mapping[];
  showAllMappings: boolean;
  setShowAllMappings: (v: boolean) => void;
  rows: Record<string, unknown>[];
  headers: string[];
  objectConfig: (typeof HS_OBJECTS)[HsObjectId];
  objectType: HsObjectId;
  pipelines: Pipeline[];
  pipelinesLoading: boolean;
  pipelinesError: string | null;
  selectedPipeline: string;
  selectedStage: string;
  currentStages: Stage[];
  onPipelineChange: (id: string) => void;
  onStageChange: (id: string) => void;
  activeRule: SavedValidationRule | null;
  hubspotConnectionId: string;
  hubspotProperties: ObjectProperty[];
  hubspotPropertiesLoading: boolean;
  hubspotPropertiesError: string | null;
  onReloadHubspotProperties: () => void;
  onPropertyCreated: (property: ObjectProperty) => void;
  onMappingOverride: (sourceHeader: string, propertyName: string) => void;
  requirementStatuses: RequirementStatus[];
  onBack: () => void;
  onContinue: () => void;
  canContinue: boolean;
};

function MappingStep({
  mappings,
  showAllMappings,
  setShowAllMappings,
  rows,
  headers,
  objectConfig,
  objectType,
  pipelines,
  pipelinesLoading,
  pipelinesError,
  selectedPipeline,
  selectedStage,
  currentStages,
  onPipelineChange,
  onStageChange,
  activeRule,
  hubspotConnectionId,
  hubspotProperties,
  hubspotPropertiesLoading,
  hubspotPropertiesError,
  onReloadHubspotProperties,
  onPropertyCreated,
  onMappingOverride,
  requirementStatuses,
  onBack,
  onContinue,
  canContinue,
}: MappingStepProps) {
  const propertyNames = useMemo(
    () => new Set(hubspotProperties.map((p) => p.name)),
    [hubspotProperties],
  );

  const annotated = useMemo(
    () => mappings.map((m) => ({ ...m, exists: propertyNames.has(m.target) })),
    [mappings, propertyNames],
  );

  const missingCount = annotated.filter((m) => !m.exists).length;

  // Show missing rows first so the user spots what needs attention.
  const ordered = useMemo(
    () => [...annotated].sort((a, b) => Number(a.exists) - Number(b.exists)),
    [annotated],
  );

  const previewCount = showAllMappings ? ordered.length : Math.min(4, ordered.length);
  const previewMappings = ordered.slice(0, previewCount);

  const [createTarget, setCreateTarget] = useState<{ source: string; target: string } | null>(null);

  return (
    <div className="space-y-8">
      <div className="grid gap-8 md:grid-cols-2">
        {/* Left — Fields Auto-Mapped */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
                <Sliders className="h-5 w-5 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Fields Auto-Mapped</h3>
            </div>
            {hubspotPropertiesLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </div>

          {hubspotPropertiesError && (
            <div className="mb-4 flex items-start justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span>Couldn&apos;t load HubSpot properties: {hubspotPropertiesError}</span>
              <button
                type="button"
                onClick={onReloadHubspotProperties}
                className="shrink-0 font-semibold underline hover:text-amber-900"
              >
                Retry
              </button>
            </div>
          )}

          {!hubspotPropertiesError && !hubspotPropertiesLoading && missingCount > 0 && (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                {missingCount} field{missingCount === 1 ? "" : "s"} not yet in HubSpot — auto-create
                to choose a type.
              </span>
            </div>
          )}

          {mappings.length === 0 ? (
            <p className="text-sm text-gray-500">
              No columns detected — go back and load some data.
            </p>
          ) : (
            <div className="space-y-2">
              {previewMappings.map((m) => (
                <div
                  key={m.source}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5"
                >
                  <code className="min-w-0 flex-1 truncate text-sm text-gray-600">{m.source}</code>
                  <ArrowRightLeft className="h-4 w-4 shrink-0 text-emerald-500" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-gray-900">{m.target}</span>
                    {m.reusedFrom && (
                      <span className="truncate text-[11px] text-gray-500">
                        reused — was <code className="font-mono">{m.reusedFrom}</code>
                      </span>
                    )}
                  </div>
                  {hubspotPropertiesLoading ? (
                    <Badge
                      variant="secondary"
                      className="shrink-0 bg-gray-100 text-[10px] uppercase text-gray-500"
                    >
                      …
                    </Badge>
                  ) : m.exists ? (
                    <Badge
                      variant="secondary"
                      className={cn(
                        "shrink-0 text-[10px] uppercase",
                        m.reusedFrom
                          ? "bg-sky-100 text-sky-700"
                          : "bg-emerald-100 text-emerald-700",
                      )}
                    >
                      <Check className="mr-0.5 h-3 w-3" strokeWidth={3} />{" "}
                      {m.reusedFrom ? "Reused" : "In HubSpot"}
                    </Badge>
                  ) : (
                    <>
                      <Badge
                        variant="secondary"
                        className="shrink-0 bg-amber-100 text-[10px] uppercase text-amber-700"
                      >
                        New
                      </Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 px-2 text-xs"
                        onClick={() => setCreateTarget({ source: m.source, target: m.target })}
                      >
                        <Sparkles className="mr-1 h-3 w-3" />
                        Auto-create
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {ordered.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAllMappings(!showAllMappings)}
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 hover:text-emerald-700"
            >
              {showAllMappings
                ? "Hide"
                : `Show all ${ordered.length} mappings${missingCount ? ` (${missingCount} new)` : ""}`}
              <ArrowRightLeft className="h-3.5 w-3.5" />
            </button>
          )}

          {createTarget && (
            <AutoCreatePropertyDialog
              open={createTarget !== null}
              sourceHeader={createTarget.source}
              targetName={createTarget.target}
              objectType={objectType}
              hubspotConnectionId={hubspotConnectionId}
              rows={rows}
              onClose={() => setCreateTarget(null)}
              onCreated={(property, reused) => {
                onPropertyCreated(property);
                if (reused && createTarget && property.name !== createTarget.target) {
                  onMappingOverride(createTarget.source, property.name);
                }
                setCreateTarget(null);
              }}
            />
          )}
        </div>

        {/* Right — Configuration Defaults */}
        <div className="space-y-6">
          <h3 className="text-2xl font-bold text-gray-900">Configuration Defaults</h3>

          {objectConfig.supportsPipeline && (
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Select Pipeline
              </Label>
              {pipelinesError ? (
                <p className="text-sm text-destructive">{pipelinesError}</p>
              ) : (
                <Select
                  value={selectedPipeline}
                  onValueChange={onPipelineChange}
                  disabled={pipelinesLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={pipelinesLoading ? "Loading…" : "Select pipeline"} />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs italic text-gray-500">Defaults to primary sales pipeline.</p>
            </div>
          )}

          {objectConfig.supportsPipeline && (
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Select {objectConfig.stageNoun}
              </Label>
              <Select
                value={selectedStage}
                onValueChange={onStageChange}
                disabled={pipelinesLoading || !selectedPipeline}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {currentStages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!objectConfig.supportsPipeline && (
            <p className="text-sm text-gray-500">
              No pipeline configuration needed for {objectConfig.label.toLowerCase()}.
            </p>
          )}

          {activeRule && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Validation Profile
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">{activeRule.label}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {activeRule.rules.fields.length} field rule(s) will be enforced.
              </p>
            </div>
          )}

          {requirementStatuses.some((r) => !r.satisfied) && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertCircle className="h-4 w-4" />
                Required field
                {requirementStatuses.filter((r) => !r.satisfied).length === 1 ? "" : "s"} missing
              </p>
              <ul className="mt-1.5 space-y-1 text-xs">
                {requirementStatuses
                  .filter((r) => !r.satisfied)
                  .map((r) => (
                    <li key={r.field.label}>
                      <strong className="font-medium">{r.field.label}</strong> — {r.field.hint} Map
                      a source column to one of:{" "}
                      <code className="font-mono">{r.field.names.join(", ")}</code>.
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <Button
            onClick={onContinue}
            disabled={!canContinue}
            className="w-full bg-gray-900 py-6 text-base font-bold tracking-wide text-white hover:bg-gray-800"
          >
            START MIGRATION
            <Rocket className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Preview */}
      {rows.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-gray-500" />
            <h3 className="text-base font-bold text-gray-900">
              Preview{" "}
              <span className="font-normal text-gray-500">
                — first {Math.min(5, rows.length)} of {rows.length} rows
              </span>
            </h3>
          </div>
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <Table>
              <TableHeader>
                <TableRow>
                  {headers.map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 5).map((r, i) => (
                  <TableRow key={i}>
                    {headers.map((h) => (
                      <TableCell key={h} className="max-w-xs truncate">
                        {String(r[h] ?? "")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack} className="text-gray-600">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Auto-create HubSpot property dialog (Mapping step)
// ---------------------------------------------------------------------

type AutoCreatePropertyDialogProps = {
  open: boolean;
  sourceHeader: string;
  targetName: string;
  objectType: HsObjectId;
  hubspotConnectionId: string;
  rows: Record<string, unknown>[];
  onClose: () => void;
  onCreated: (property: ObjectProperty, reused: boolean) => void;
};

type EnumOption = { label: string; value: string };

function collectDistinctValues(rows: Record<string, unknown>[], header: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const raw = row[header];
    if (raw === null || raw === undefined) continue;
    const s = String(raw).trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= 100) break;
  }
  return out;
}

function AutoCreatePropertyDialog({
  open,
  sourceHeader,
  targetName,
  objectType,
  hubspotConnectionId,
  rows,
  onClose,
  onCreated,
}: AutoCreatePropertyDialogProps) {
  const [label, setLabel] = useState(sourceHeader);
  const [name, setName] = useState(targetName);
  const [type, setType] = useState<NewPropertyType>("string");
  const [options, setOptions] = useState<EnumOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optionsPrefilledForType, setOptionsPrefilledForType] = useState<NewPropertyType | null>(
    null,
  );

  // Reset when reopening with a new target.
  useEffect(() => {
    setLabel(sourceHeader);
    setName(targetName);
    setType("string");
    setOptions([]);
    setOptionsPrefilledForType(null);
    setError(null);
  }, [sourceHeader, targetName]);

  const typeMeta = NEW_PROPERTY_TYPES.find((t) => t.value === type);
  const isEnum = !!typeMeta?.isEnum;

  // Prefill enum options from the source column the first time the user picks an enum type.
  useEffect(() => {
    if (!isEnum) return;
    if (optionsPrefilledForType === type) return;
    const distinct = collectDistinctValues(rows, sourceHeader);
    const seenValues = new Set<string>();
    const prefilled: EnumOption[] = [];
    for (const raw of distinct) {
      const v = toEnumValue(raw);
      if (!v) continue;
      let dedup = v;
      let i = 2;
      while (seenValues.has(dedup)) {
        dedup = `${v}_${i++}`;
      }
      seenValues.add(dedup);
      prefilled.push({ label: raw, value: dedup });
    }
    setOptions(prefilled.length > 0 ? prefilled : [{ label: "", value: "" }]);
    setOptionsPrefilledForType(type);
  }, [isEnum, type, optionsPrefilledForType, rows, sourceHeader]);

  const trimmedName = name.trim();
  const trimmedLabel = label.trim();
  const nameValid = PROPERTY_NAME_RE.test(trimmedName);
  const cleanedOptions = options
    .map((o) => ({ label: o.label.trim(), value: o.value.trim() }))
    .filter((o) => o.label && o.value);
  const optionsValid = !isEnum || cleanedOptions.length > 0;
  const canSubmit = nameValid && trimmedLabel.length > 0 && optionsValid && !submitting;

  const updateOption = (i: number, patch: Partial<EnumOption>) => {
    setOptions((prev) =>
      prev.map((o, idx) => {
        if (idx !== i) return o;
        const next = { ...o, ...patch };
        // Auto-sync value when user is editing label and value mirrored it.
        if (patch.label !== undefined && o.value === toEnumValue(o.label)) {
          next.value = toEnumValue(patch.label);
        }
        return next;
      }),
    );
  };

  const addOption = () => setOptions((prev) => [...prev, { label: "", value: "" }]);
  const removeOption = (i: number) => setOptions((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/object-properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hubspotConnectionId: hubspotConnectionId || undefined,
          objectType,
          name: trimmedName,
          label: trimmedLabel,
          type,
          options: isEnum ? cleanedOptions : undefined,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        property?: ObjectProperty;
        reused?: boolean;
        error?: string;
      };
      if (!data.ok || !data.property) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      onCreated(data.property, Boolean(data.reused));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !submitting) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create HubSpot property</DialogTitle>
          <DialogDescription>
            This property will be added to your HubSpot {HS_OBJECTS[objectType].label.toLowerCase()}{" "}
            object so the column &ldquo;{sourceHeader}&rdquo; can be imported.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ac-label">Label</Label>
            <Input
              id="ac-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Lead source detail"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ac-name">Internal name</Label>
            <Input
              id="ac-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="font-mono"
            />
            <p className="text-xs text-gray-500">
              Lowercase letters, digits, and underscores. Must start with a letter.
            </p>
            {!nameValid && trimmedName.length > 0 && (
              <p className="text-xs text-destructive">Invalid internal name.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ac-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as NewPropertyType)}>
              <SelectTrigger id="ac-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NEW_PROPERTY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isEnum && (
            <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50/50 p-3">
              <div className="flex items-center justify-between">
                <Label>Options</Label>
                <span className="text-xs text-gray-500">
                  {cleanedOptions.length > 0
                    ? `${cleanedOptions.length} option${cleanedOptions.length === 1 ? "" : "s"}`
                    : "Add at least one"}
                </span>
              </div>
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      placeholder="Label"
                      value={opt.label}
                      onChange={(e) => updateOption(i, { label: e.target.value })}
                      className="h-8 flex-1"
                    />
                    <Input
                      placeholder="value"
                      value={opt.value}
                      onChange={(e) => updateOption(i, { value: e.target.value })}
                      className="h-8 w-36 font-mono text-xs"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      onClick={() => removeOption(i)}
                      title="Remove option"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addOption}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add option
              </Button>
              <p className="text-xs text-gray-500">
                Prefilled from distinct values in &ldquo;{sourceHeader}&rdquo;. Edit, remove, or add
                more as needed.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Creating…
              </>
            ) : (
              <>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Create in HubSpot
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Step 4 — Review
// =====================================================================

type PreviewRow = { sourceIndex: number; values: Record<string, unknown> };

type ReviewStepProps = {
  rows: Record<string, unknown>[];
  objectConfig: (typeof HS_OBJECTS)[HsObjectId];
  selectedSourceLabel: string;
  selectedHubspotName: string | null;
  selectedPipelineName: string | null;
  activeRule: SavedValidationRule | null;
  previewRows: PreviewRow[];
  previewColumns: string[];
  previewInvalidCount: number;
  hubspotProperties: ObjectProperty[];
  editedValues: Record<number, Record<string, unknown>>;
  onCellEdit: (sourceIndex: number, targetKey: string, value: unknown) => void;
  onBack: () => void;
  startImport: () => void;
  canTrigger: boolean;
  running: boolean;
  stageStates: Partial<Record<StageId, StageState>>;
  stageSummaries: Partial<Record<StageId, StageSummary>>;
  stageErrors: Partial<Record<StageId, string>>;
  importProgress: { current: number; total: number } | null;
  fatalError: string | null;
  importSummary: { ok: number; err: number };
};

const PREVIEW_PAGE_SIZE = 20;

function ReviewStep({
  rows,
  objectConfig,
  selectedSourceLabel,
  selectedHubspotName,
  selectedPipelineName,
  activeRule,
  previewRows,
  previewColumns,
  previewInvalidCount,
  hubspotProperties,
  editedValues,
  onCellEdit,
  onBack,
  startImport,
  canTrigger,
  running,
  stageStates,
  stageSummaries,
  stageErrors,
  importProgress,
  fatalError,
  importSummary,
}: ReviewStepProps) {
  const hasRun = Object.keys(stageSummaries).length > 0 || running || !!fatalError;
  const [reviewOpen, setReviewOpen] = useState(false);

  return (
    <div className="flex flex-col items-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
        <Rocket className="h-7 w-7 text-emerald-600" />
      </div>
      <h2 className="mt-6 text-3xl font-bold text-gray-900">Ready for Liftoff</h2>
      <p className="mt-3 max-w-md text-center text-gray-500">
        Everything is mapped and validated. We&apos;re ready to move{" "}
        <strong className="font-bold text-gray-900">
          {previewRows.length.toLocaleString()} records
        </strong>{" "}
        into your{" "}
        <strong className="font-bold text-gray-900">
          HubSpot {objectConfig.label.toLowerCase()}
        </strong>{" "}
        collection.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button
          variant="outline"
          size="lg"
          onClick={() => setReviewOpen(true)}
          className="px-8 py-6 text-base font-bold"
          disabled={running}
        >
          <Eye className="mr-2 h-5 w-5" />
          Review records
        </Button>
        <Button
          onClick={startImport}
          disabled={!canTrigger}
          size="lg"
          className="bg-gray-900 px-10 py-6 text-base font-bold text-white hover:bg-gray-800"
        >
          {running ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Migrating…
            </>
          ) : (
            <>Trigger Migration</>
          )}
        </Button>
      </div>

      <div className="mt-12 w-full max-w-xl rounded-2xl border border-gray-200 bg-gray-50/50 p-6">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Audit Summary
        </p>
        <div className="space-y-2.5">
          <SummaryRow label="Source Entity" value={selectedSourceLabel} />
          <SummaryRow
            label="Target Object"
            value={
              <span className="font-bold uppercase text-emerald-600 underline">
                {objectConfig.label}
              </span>
            }
          />
          {selectedHubspotName && (
            <SummaryRow label="HubSpot Account" value={selectedHubspotName} />
          )}
          {selectedPipelineName && (
            <SummaryRow label="Active Pipeline" value={selectedPipelineName} />
          )}
          {activeRule && <SummaryRow label="Validation" value={activeRule.label} />}
          <SummaryRow
            label="Records"
            value={
              previewInvalidCount > 0
                ? `${previewRows.length.toLocaleString()} (of ${rows.length.toLocaleString()} — ${previewInvalidCount} excluded by validation)`
                : previewRows.length.toLocaleString()
            }
          />
        </div>
      </div>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Records to migrate</DialogTitle>
            <DialogDescription>
              Final look at the normalized + validated data. Click any cell to edit before
              triggering migration.
            </DialogDescription>
          </DialogHeader>
          <ReviewPreviewTable
            previewRows={previewRows}
            previewColumns={previewColumns}
            previewInvalidCount={previewInvalidCount}
            hubspotProperties={hubspotProperties}
            editedValues={editedValues}
            onCellEdit={onCellEdit}
            disabled={running}
          />
        </DialogContent>
      </Dialog>

      {hasRun && (
        <div className="mt-10 w-full max-w-3xl">
          <div className="mb-4">
            <h3 className="text-base font-bold text-gray-900">Pipeline progress</h3>
            <p className="text-sm text-gray-500">
              {importSummary.ok} succeeded · {importSummary.err} failed
              {importProgress && ` · ${importProgress.current}/${importProgress.total} imported`}
            </p>
          </div>
          <PipelineProgress
            states={stageStates}
            summaries={stageSummaries}
            errors={stageErrors}
            importProgress={importProgress ?? undefined}
            fatal={fatalError}
          />
        </div>
      )}

      <div className="mt-10 self-stretch">
        <Button variant="ghost" onClick={onBack} className="text-gray-600" disabled={running}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>
    </div>
  );
}

type ReviewPreviewTableProps = {
  previewRows: PreviewRow[];
  previewColumns: string[];
  previewInvalidCount: number;
  hubspotProperties: ObjectProperty[];
  editedValues: Record<number, Record<string, unknown>>;
  onCellEdit: (sourceIndex: number, targetKey: string, value: unknown) => void;
  disabled: boolean;
};

function ReviewPreviewTable({
  previewRows,
  previewColumns,
  previewInvalidCount,
  hubspotProperties,
  editedValues,
  onCellEdit,
  disabled,
}: ReviewPreviewTableProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activeCell, setActiveCell] = useState<{ sourceIndex: number; key: string } | null>(null);
  const [draft, setDraft] = useState("");

  const editedCount = Object.keys(editedValues).length;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return previewRows;
    return previewRows.filter((row) => {
      if (String(row.sourceIndex).includes(q)) return true;
      for (const col of previewColumns) {
        const v = row.values[col];
        if (v === null || v === undefined) continue;
        if (String(v).toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [previewRows, previewColumns, search]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PREVIEW_PAGE_SIZE));

  // Reset to page 1 when the search changes (otherwise users land on an empty page).
  useEffect(() => {
    setPage(1);
  }, [search]);

  // Clamp page when the underlying data shrinks (e.g. after edits invalidate rows).
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const labelByName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of hubspotProperties) m[p.name] = p.label;
    return m;
  }, [hubspotProperties]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * PREVIEW_PAGE_SIZE;
    return filteredRows.slice(start, start + PREVIEW_PAGE_SIZE);
  }, [filteredRows, page]);

  if (previewRows.length === 0) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        No rows will be migrated.{" "}
        {previewInvalidCount > 0
          ? `All ${previewInvalidCount} rows were excluded by validation.`
          : "Go back and load some data."}
      </div>
    );
  }

  const startEdit = (sourceIndex: number, key: string, current: unknown) => {
    if (disabled) return;
    setActiveCell({ sourceIndex, key });
    setDraft(current === null || current === undefined ? "" : String(current));
  };

  const commitEdit = () => {
    if (!activeCell) return;
    const trimmed = draft;
    onCellEdit(activeCell.sourceIndex, activeCell.key, trimmed === "" ? null : trimmed);
    setActiveCell(null);
  };

  const cancelEdit = () => setActiveCell(null);

  const isEdited = (sourceIndex: number, sourceColumns: string[]): boolean => {
    const edits = editedValues[sourceIndex];
    if (!edits) return false;
    return sourceColumns.some((k) => k in edits);
  };

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">
            Normalized + validated
            {previewInvalidCount > 0 ? ` (${previewInvalidCount} excluded)` : ""}
            {editedCount > 0 ? ` · ${editedCount} row${editedCount === 1 ? "" : "s"} edited` : ""} ·
            click any cell to edit
          </p>
        </div>
        <span className="text-xs text-gray-500">
          {search.trim()
            ? `${filteredRows.length.toLocaleString()} of ${previewRows.length.toLocaleString()}`
            : `${previewRows.length.toLocaleString()} record${previewRows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="relative mb-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search records by any field…"
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

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14 text-right">#</TableHead>
              {previewColumns.map((col) => (
                <TableHead key={col} className="min-w-[140px]">
                  <div className="flex flex-col">
                    <span className="font-semibold text-gray-900">{labelByName[col] ?? col}</span>
                    {labelByName[col] && labelByName[col] !== col && (
                      <span className="font-mono text-[10px] text-gray-400">{col}</span>
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={previewColumns.length + 1}
                  className="py-6 text-center text-sm text-gray-500"
                >
                  No records match &ldquo;{search}&rdquo;.
                </TableCell>
              </TableRow>
            )}
            {pageRows.map((row) => {
              const rowEdits = editedValues[row.sourceIndex];
              const rowIsEdited = !!rowEdits && Object.keys(rowEdits).length > 0;
              return (
                <TableRow key={row.sourceIndex} className={cn(rowIsEdited && "bg-sky-50/50")}>
                  <TableCell className="text-right text-xs text-gray-400">
                    {row.sourceIndex}
                  </TableCell>
                  {previewColumns.map((col) => {
                    const value = row.values[col];
                    const editing =
                      activeCell?.sourceIndex === row.sourceIndex && activeCell.key === col;
                    return (
                      <TableCell
                        key={col}
                        className={cn(
                          "max-w-xs cursor-text align-top",
                          isEdited(row.sourceIndex, [col]) &&
                            !editing &&
                            "bg-sky-100/60 font-medium",
                        )}
                        onClick={() => !editing && startEdit(row.sourceIndex, col, value)}
                      >
                        {editing ? (
                          <Input
                            autoFocus
                            value={draft}
                            disabled={disabled}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitEdit();
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                cancelEdit();
                              }
                            }}
                            className="h-7 text-sm"
                          />
                        ) : value === null || value === undefined || value === "" ? (
                          <span className="text-xs italic text-gray-400">empty</span>
                        ) : (
                          <span className="block truncate text-sm">{String(value)}</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Showing{" "}
            <strong className="font-medium text-gray-900">
              {((page - 1) * PREVIEW_PAGE_SIZE + 1).toLocaleString()}–
              {Math.min(page * PREVIEW_PAGE_SIZE, filteredRows.length).toLocaleString()}
            </strong>{" "}
            of{" "}
            <strong className="font-medium text-gray-900">
              {filteredRows.length.toLocaleString()}
            </strong>
            {search.trim() && (
              <span className="text-gray-400">
                {" "}
                (filtered from {previewRows.length.toLocaleString()})
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Previous
            </Button>
            <span className="text-xs text-gray-600">
              Page {page} of {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page === pageCount}
            >
              Next <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}
