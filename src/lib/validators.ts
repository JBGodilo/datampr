import type { HsObjectId } from "@/lib/hubspot-objects";

export type FieldFormat = "email" | "phone" | "url" | "company_domain";

export type FieldRule = {
  name: string;
  required: boolean;
  format?: FieldFormat;
};

export type ValidationRuleSet = {
  fields: FieldRule[];
};

export type SavedValidationRule = {
  id: string;
  object_type: HsObjectId;
  label: string;
  rules: ValidationRuleSet;
  created_at: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
const PHONE_RE = /^\+?[0-9\s().-]{7,}$/;
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function isEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

export function isUrl(v: string): boolean {
  return URL_RE.test(v.trim());
}

export function isPhone(v: string): boolean {
  return PHONE_RE.test(v.trim());
}

export function isDomainLike(v: string): boolean {
  return DOMAIN_RE.test(v.trim());
}

export function extractDomain(v: string): string | null {
  const raw = v.trim().toLowerCase();
  if (!raw) return null;
  // Allow either bare domain or email address.
  if (raw.includes("@")) {
    const parts = raw.split("@");
    if (parts.length === 2 && isDomainLike(parts[1])) return parts[1];
    return null;
  }
  // Strip protocol + path if user pasted a URL.
  const stripped = raw.replace(/^https?:\/\//, "").split("/")[0];
  return isDomainLike(stripped) ? stripped : null;
}

function findValue(row: Record<string, unknown>, fieldName: string): unknown {
  if (fieldName in row) return row[fieldName];
  const lower = fieldName.toLowerCase();
  const match = Object.keys(row).find((k) => k.toLowerCase() === lower);
  return match ? row[match] : undefined;
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

export type RowValidationResult = { valid: boolean; errors: string[] };

export function validateRowSync(
  row: Record<string, unknown>,
  ruleSet: ValidationRuleSet | null,
): RowValidationResult {
  if (!ruleSet) return { valid: true, errors: [] };
  const errors: string[] = [];

  for (const rule of ruleSet.fields) {
    const raw = findValue(row, rule.name);
    const blank = isBlank(raw);

    if (rule.required && blank) {
      errors.push(`${rule.name} is required`);
      continue;
    }
    if (blank) continue;

    const value = String(raw);
    switch (rule.format) {
      case "email":
        if (!isEmail(value)) errors.push(`${rule.name} must be a valid email`);
        break;
      case "phone":
        if (!isPhone(value)) errors.push(`${rule.name} must be a valid phone number`);
        break;
      case "url":
        if (!isUrl(value)) errors.push(`${rule.name} must be a valid URL`);
        break;
      case "company_domain":
        if (!extractDomain(value)) errors.push(`${rule.name} must be a valid domain`);
        break;
    }
  }

  return { valid: errors.length === 0, errors };
}

export type DomainCheck = (domain: string) => Promise<boolean>;

export async function validateRow(
  row: Record<string, unknown>,
  ruleSet: ValidationRuleSet | null,
  checkDomain?: DomainCheck,
): Promise<RowValidationResult> {
  const sync = validateRowSync(row, ruleSet);
  if (!sync.valid || !ruleSet || !checkDomain) return sync;

  const errors = [...sync.errors];
  for (const rule of ruleSet.fields) {
    if (rule.format !== "company_domain") continue;
    const raw = findValue(row, rule.name);
    if (isBlank(raw)) continue;
    const domain = extractDomain(String(raw));
    if (!domain) continue;
    const ok = await checkDomain(domain);
    if (!ok) errors.push(`${rule.name}: domain "${domain}" not reachable`);
  }
  return { valid: errors.length === 0, errors };
}
