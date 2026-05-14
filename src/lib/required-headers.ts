import { HS_OBJECTS, type HsObjectId } from "@/lib/hubspot-objects";

// Per-object required identifier properties. If none of the source columns
// map to any of these names (or aliases), HubSpot will silently create rows
// with no identifier — making them undeduplicatable junk. We block import
// until the user maps something usable.
//
// Each entry is one OR-group: at least ONE name from the group must be
// satisfied for the requirement to pass.

export type RequiredField = {
  // Property names that satisfy this requirement (any one is enough).
  names: string[];
  // What to call the requirement in the UI.
  label: string;
  // Human description of why it matters.
  hint: string;
};

const REQUIRED: Record<HsObjectId, RequiredField[]> = {
  contacts: [
    {
      names: ["email"],
      label: "Email",
      hint: "HubSpot uses email as the primary identifier for contacts.",
    },
  ],
  companies: [
    {
      names: ["name", "domain"],
      label: "Name or domain",
      hint: "HubSpot needs at least one of name or domain to identify a company.",
    },
  ],
  deals: [
    {
      names: ["dealname"],
      label: "Deal name",
      hint: "HubSpot requires dealname for every deal.",
    },
  ],
  tickets: [
    {
      names: ["subject"],
      label: "Subject",
      hint: "HubSpot requires subject for every ticket.",
    },
  ],
};

export type RequirementStatus = {
  field: RequiredField;
  satisfied: boolean;
  matchedBy: string | null; // the source header that satisfied the requirement
};

/**
 * Check whether the current mapped target columns satisfy the required
 * identifier for the given object type. `mappedTargets` is the per-source
 * mapping (source header → resolved HubSpot property name), after any
 * user overrides have been applied.
 *
 * We honor the object's `nameAliases` so e.g. "Company Name" mapping to
 * `company_name` still satisfies the "name" requirement for companies.
 */
export function checkRequiredHeaders(
  objectType: HsObjectId,
  mappedTargets: { source: string; target: string }[],
): RequirementStatus[] {
  const obj = HS_OBJECTS[objectType];
  const requirements = REQUIRED[objectType] ?? [];
  const aliasSet = new Set(obj.nameAliases.map((a) => a.toLowerCase()));

  return requirements.map((req) => {
    const accepted = new Set([
      ...req.names.map((n) => n.toLowerCase()),
      // The object's own nameProperty + aliases also satisfy any requirement
      // whose names include the nameProperty.
      ...(req.names.includes(obj.nameProperty) ? Array.from(aliasSet) : []),
    ]);

    let matchedBy: string | null = null;
    for (const m of mappedTargets) {
      if (accepted.has(m.target.toLowerCase())) {
        matchedBy = m.source;
        break;
      }
    }
    return { field: req, satisfied: matchedBy !== null, matchedBy };
  });
}

export function allRequiredSatisfied(statuses: RequirementStatus[]): boolean {
  return statuses.every((s) => s.satisfied);
}
