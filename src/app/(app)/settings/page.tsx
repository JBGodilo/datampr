"use client";

import { useEffect, useState } from "react";
import { ValidationRulesPanel } from "@/components/validation-rules-panel";
import type { HsObjectId } from "@/lib/hubspot-objects";
import type { SavedValidationRule } from "@/lib/validators";

const ACTIVE_RULES_STORAGE_KEY = "datamapr.activeValidationRuleIds";

export default function SettingsPage() {
  const [activeRuleIds, setActiveRuleIds] = useState<Partial<Record<HsObjectId, string>>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(ACTIVE_RULES_STORAGE_KEY);
      if (raw) setActiveRuleIds(JSON.parse(raw));
    } catch {
      // ignore corrupted storage
    }
  }, []);

  const handleActiveRuleChange = (obj: HsObjectId, rule: SavedValidationRule | null) => {
    setActiveRuleIds((prev) => {
      const next = { ...prev };
      if (rule) next[obj] = rule.id;
      else delete next[obj];
      try {
        window.localStorage.setItem(ACTIVE_RULES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Define validation rules per HubSpot object. Each rule is scoped to one object — pick one
          as active to apply it during import.
        </p>
      </header>
      <ValidationRulesPanel
        activeRuleIds={activeRuleIds}
        onActiveRuleChange={handleActiveRuleChange}
      />
    </div>
  );
}
