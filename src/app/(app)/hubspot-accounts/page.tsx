import { HubspotAccountsPanel } from "@/components/hubspot-accounts-panel";

export const metadata = {
  title: "HubSpot accounts · Datamapr",
};

export default function HubspotAccountsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">HubSpot accounts</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect one or more HubSpot portals and pick a default. The default is used for imports
          unless you override it on the import page.
        </p>
      </header>
      <HubspotAccountsPanel />
    </div>
  );
}
