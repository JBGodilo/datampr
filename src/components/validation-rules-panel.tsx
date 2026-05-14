"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { HS_OBJECTS, type HsObjectId } from "@/lib/hubspot-objects";
import type {
  FieldFormat,
  FieldRule,
  SavedValidationRule,
  ValidationRuleSet,
} from "@/lib/validators";

type ObjectProperty = { name: string; label: string };

const OBJECT_ORDER: HsObjectId[] = ["contacts", "companies", "deals", "tickets"];
const FORMAT_OPTIONS: { value: FieldFormat | "none"; label: string }[] = [
  { value: "none", label: "Any text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "URL" },
  { value: "company_domain", label: "Company domain" },
];

type DraftRule = {
  id: string | null;
  label: string;
  fields: FieldRule[];
};

const EMPTY_DRAFT: DraftRule = { id: null, label: "", fields: [] };

export type ValidationRulesPanelProps = {
  onActiveRuleChange?: (objectType: HsObjectId, rule: SavedValidationRule | null) => void;
  activeRuleIds: Partial<Record<HsObjectId, string>>;
};

export function ValidationRulesPanel({
  onActiveRuleChange,
  activeRuleIds,
}: ValidationRulesPanelProps) {
  return (
    <Tabs defaultValue="contacts">
      <TabsList className="grid w-full grid-cols-4">
        {OBJECT_ORDER.map((id) => (
          <TabsTrigger key={id} value={id}>
            {HS_OBJECTS[id].label}
          </TabsTrigger>
        ))}
      </TabsList>
      {OBJECT_ORDER.map((id) => (
        <TabsContent key={id} value={id}>
          <ObjectRulesPanel
            objectType={id}
            activeRuleId={activeRuleIds[id] ?? ""}
            onActiveRuleChange={onActiveRuleChange}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

type ObjectRulesPanelProps = {
  objectType: HsObjectId;
  activeRuleId: string;
  onActiveRuleChange?: (objectType: HsObjectId, rule: SavedValidationRule | null) => void;
};

function ObjectRulesPanel({ objectType, activeRuleId, onActiveRuleChange }: ObjectRulesPanelProps) {
  const [rules, setRules] = useState<SavedValidationRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftRule>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [properties, setProperties] = useState<ObjectProperty[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/validation-rules?object_type=${objectType}`);
      const data = (await res.json()) as {
        ok: boolean;
        rules?: SavedValidationRule[];
        error?: string;
      };
      if (!data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setRules(data.rules ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [objectType]);

  const loadProperties = useCallback(async () => {
    setPropertiesLoading(true);
    setPropertiesError(null);
    try {
      const res = await fetch(`/api/object-properties?objectType=${objectType}`);
      const data = (await res.json()) as {
        ok: boolean;
        properties?: ObjectProperty[];
        error?: string;
      };
      if (!data.ok) {
        setPropertiesError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setProperties(data.properties ?? []);
    } catch (err) {
      setPropertiesError((err as Error).message);
    } finally {
      setPropertiesLoading(false);
    }
  }, [objectType]);

  useEffect(() => {
    load();
    loadProperties();
  }, [load, loadProperties]);

  const editExisting = (rule: SavedValidationRule) => {
    setDraft({
      id: rule.id,
      label: rule.label,
      fields: rule.rules.fields.map((f) => ({ ...f })),
    });
  };

  const startNew = () => setDraft({ ...EMPTY_DRAFT, fields: [{ name: "", required: false }] });

  const addField = () => {
    setDraft((d) => ({ ...d, fields: [...d.fields, { name: "", required: false }] }));
  };

  const updateField = (index: number, patch: Partial<FieldRule>) => {
    setDraft((d) => ({
      ...d,
      fields: d.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }));
  };

  const removeField = (index: number) => {
    setDraft((d) => ({ ...d, fields: d.fields.filter((_, i) => i !== index) }));
  };

  const save = async () => {
    if (!draft.label.trim() || draft.fields.length === 0) return;
    const cleaned: ValidationRuleSet = {
      fields: draft.fields
        .map((f) => ({ ...f, name: f.name.trim() }))
        .filter((f) => f.name.length > 0),
    };
    if (cleaned.fields.length === 0) {
      setError("Add at least one field with a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const isUpdate = !!draft.id;
      const res = await fetch(
        isUpdate
          ? `/api/validation-rules?id=${encodeURIComponent(draft.id!)}`
          : `/api/validation-rules`,
        {
          method: isUpdate ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            object_type: objectType,
            label: draft.label.trim(),
            rules: cleaned,
          }),
        },
      );
      const data = (await res.json()) as {
        ok: boolean;
        rule?: SavedValidationRule;
        error?: string;
      };
      if (!data.ok || !data.rule) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setRules((prev) => {
        if (isUpdate) return prev.map((r) => (r.id === data.rule!.id ? data.rule! : r));
        return [data.rule!, ...prev];
      });
      setDraft(EMPTY_DRAFT);
      if (activeRuleId === data.rule.id) {
        onActiveRuleChange?.(objectType, data.rule);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/validation-rules?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setRules((prev) => prev.filter((r) => r.id !== id));
      if (draft.id === id) setDraft(EMPTY_DRAFT);
      if (activeRuleId === id) onActiveRuleChange?.(objectType, null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  const setActive = (id: string) => {
    if (!id) {
      onActiveRuleChange?.(objectType, null);
      return;
    }
    const rule = rules.find((r) => r.id === id);
    onActiveRuleChange?.(objectType, rule ?? null);
  };

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label>Active rule for {HS_OBJECTS[objectType].label.toLowerCase()} imports</Label>
        <Select
          value={activeRuleId || "__none__"}
          onValueChange={(v) => setActive(v === "__none__" ? "" : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="No validation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No validation</SelectItem>
            {rules.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Only applied when importing {HS_OBJECTS[objectType].label.toLowerCase()} records.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Saved profiles</Label>
          <Button size="sm" variant="outline" onClick={startNew}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New profile
          </Button>
        </div>
        {loading ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No profiles yet. Create one below.</p>
        ) : (
          <div className="space-y-1">
            {rules.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.rules.fields.length} field rule(s)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => editExisting(r)}>
                    Edit
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => remove(r.id)}
                    disabled={deletingId === r.id}
                    title="Delete profile"
                  >
                    {deletingId === r.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(draft.id !== null || draft.fields.length > 0 || draft.label) && (
        <div className="space-y-3 rounded-md border p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`label-${objectType}`}>
              Profile name {draft.id ? "(editing)" : "(new)"}
            </Label>
            <Input
              id={`label-${objectType}`}
              placeholder="e.g. Strict contacts"
              value={draft.label}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            />
          </div>

          {propertiesError && (
            <p className="text-xs text-muted-foreground">
              Couldn&apos;t load properties from HubSpot ({propertiesError}). You can still type
              names manually.
            </p>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Field name</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead className="w-[100px]">Required</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {draft.fields.map((f, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <PropertyCombobox
                        value={f.name}
                        properties={properties}
                        loading={propertiesLoading}
                        onChange={(name) => updateField(i, { name })}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={f.format ?? "none"}
                        onValueChange={(v) =>
                          updateField(i, { format: v === "none" ? undefined : (v as FieldFormat) })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FORMAT_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={f.required}
                        onCheckedChange={(checked) => updateField(i, { required: checked })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeField(i)}
                        title="Remove field"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <Button size="sm" variant="outline" onClick={addField}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add field
            </Button>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setDraft(EMPTY_DRAFT)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={save}
                disabled={saving || !draft.label.trim() || draft.fields.length === 0}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <Save className="mr-1.5 h-3.5 w-3.5" /> Save profile
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

type PropertyComboboxProps = {
  value: string;
  properties: ObjectProperty[];
  loading: boolean;
  onChange: (name: string) => void;
};

function PropertyCombobox({ value, properties, loading, onChange }: PropertyComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const known = properties.find((p) => p.name === value);
  const trimmedSearch = search.trim();
  const searchMatchesKnown = properties.some(
    (p) => p.name.toLowerCase() === trimmedSearch.toLowerCase(),
  );

  const display = known ? known.label : value || "Select a property…";

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {loading && !value ? "Loading properties…" : display}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput
            placeholder="Search properties or type a custom name…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </div>
            ) : (
              <>
                <CommandEmpty>
                  {trimmedSearch ? (
                    <button
                      type="button"
                      className="w-full px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                      onClick={() => {
                        onChange(trimmedSearch);
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      Use custom: <span className="font-mono">{trimmedSearch}</span>
                    </button>
                  ) : (
                    <span className="px-2 py-2 text-sm text-muted-foreground">
                      No matching properties.
                    </span>
                  )}
                </CommandEmpty>
                <CommandGroup heading="HubSpot properties">
                  {properties.map((p) => (
                    <CommandItem
                      key={p.name}
                      value={`${p.label} ${p.name}`}
                      onSelect={() => {
                        onChange(p.name);
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === p.name ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="flex flex-col">
                        <span>{p.label}</span>
                        <span className="text-xs text-muted-foreground">{p.name}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
                {trimmedSearch && !searchMatchesKnown && (
                  <CommandGroup heading="Custom">
                    <CommandItem
                      value={`__custom__ ${trimmedSearch}`}
                      onSelect={() => {
                        onChange(trimmedSearch);
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Use custom: <span className="ml-1 font-mono">{trimmedSearch}</span>
                    </CommandItem>
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
