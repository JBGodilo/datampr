import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  GitMerge,
  Mail,
  Rocket,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const HOW_IT_WORKS = [
  {
    step: 1,
    title: "Pick a source",
    description:
      "Upload a CSV or connect Airtable, Google Sheets, and more. Datamapr auto-detects columns and shows a preview before you continue.",
    icon: FileSpreadsheet,
    bullets: [
      "CSV upload (any size)",
      "Airtable & Google Sheets",
      "Heroku, Notion, Pipedrive coming soon",
    ],
  },
  {
    step: 2,
    title: "Choose a destination",
    description:
      "Tell Datamapr which HubSpot account and object to load — contacts, companies, deals, or tickets — and optionally attach a validation profile.",
    icon: Database,
    bullets: [
      "Contacts, companies, deals, tickets",
      "Multiple connected HubSpot portals",
      "Saved validation profiles",
    ],
  },
  {
    step: 3,
    title: "Map fields",
    description:
      "Datamapr auto-maps fields it recognises and lets you create missing HubSpot properties on the fly. Preview rows before committing.",
    icon: GitMerge,
    bullets: [
      "Smart auto-mapping",
      "One-click property creation",
      "Live preview of the first 5 rows",
    ],
  },
  {
    step: 4,
    title: "Review & launch",
    description:
      "See exactly what will be imported, watch the pipeline run through normalization, validation, transformation, dedupe, and load — with per-stage timings.",
    icon: Rocket,
    bullets: [
      "Audit summary before launch",
      "Stage-by-stage pipeline progress",
      "Re-runs from import history",
    ],
  },
];

const FEATURES = [
  {
    title: "Validation profiles",
    description: "Reusable rule sets that catch bad data before it ever touches HubSpot.",
    icon: ShieldCheck,
  },
  {
    title: "Auto-mapping & auto-create",
    description:
      "Recognised columns map themselves; new ones become HubSpot properties in one click.",
    icon: Sparkles,
  },
  {
    title: "Pipeline transparency",
    description:
      "Every stage — normalize, validate, transform, dedupe, load — is logged with timings.",
    icon: Workflow,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-xl font-extrabold italic tracking-tight">
              <span className="text-gray-900">DATA</span>
              <span className="text-emerald-500">MAPR</span>
            </span>
            <span className="hidden text-[10px] font-semibold tracking-[0.18em] text-gray-400 sm:inline">
              CONNECT · MIGRATE · SCALE
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <a
              href="#how-it-works"
              className="hidden rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground sm:inline-block"
            >
              How it works
            </a>
            <a
              href="#contact"
              className="hidden rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground sm:inline-block"
            >
              Contact
            </a>
            <Button asChild size="sm">
              <Link href="/auth/login">Sign in</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-20 sm:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <Sparkles className="h-3.5 w-3.5" />
            Connect · Migrate · Scale
          </div>
          <h1 className="text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
            Map any source to <span className="text-emerald-500">HubSpot</span> — without the
            spreadsheet gymnastics.
          </h1>
          <p className="mt-5 text-pretty text-lg text-muted-foreground">
            Datamapr takes your CSV, Airtable, or Google Sheets data and loads it cleanly into
            HubSpot contacts, companies, deals, or tickets. Validate, dedupe, and audit every record
            before it lands.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/auth/login">
                Get started <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
          <p className="mt-3 text-muted-foreground">
            Four guided steps from raw data to a verified HubSpot import.
          </p>
        </div>

        <ol className="mt-12 grid gap-6 md:grid-cols-2">
          {HOW_IT_WORKS.map(({ step, title, description, icon: Icon, bullets }) => (
            <li
              key={step}
              className="relative rounded-2xl border bg-card p-6 shadow-sm transition hover:shadow-md"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Step {step}
                  </span>
                </div>
              </div>
              <h3 className="text-xl font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
              <ul className="mt-4 space-y-1.5">
                {bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Built for clean imports</h2>
          <p className="mt-3 text-muted-foreground">
            Catch data issues before they reach HubSpot, and see exactly what happened on every run.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {FEATURES.map(({ title, description, icon: Icon }) => (
            <div key={title} className="rounded-xl border bg-card p-5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="contact" className="mx-auto max-w-6xl px-6 py-16">
        <div className="overflow-hidden rounded-3xl border bg-gradient-to-br from-emerald-50 via-card to-card p-8 sm:p-12">
          <div className="grid items-center gap-8 md:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Questions? Need access?</h2>
              <p className="mt-3 text-muted-foreground">
                Datamapr is invitation-only while we onboard early teams. Reach out to the
                administrator for an account, a demo, or to discuss your migration.
              </p>
            </div>
            <div className="flex flex-col gap-3 md:items-end">
              <Button asChild size="lg">
                <a href={`mailto:jbgodilo2@gmail.com?subject=Datamapr%20inquiry`}>
                  <Mail className="mr-2 h-4 w-4" />
                  Contact administrator
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 bg-background/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground sm:flex-row">
          <span>
            &copy; {new Date().getFullYear()} Datamapr. Connect &middot; Migrate &middot; Scale.
          </span>
          <div className="flex items-center gap-4">
            <a href="#how-it-works" className="hover:text-foreground">
              How it works
            </a>
            <a href="#contact" className="hover:text-foreground">
              Contact
            </a>
            <Link href="/auth/login" className="hover:text-foreground">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
