"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Save, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export type HubspotConnection = {
  id: string;
  label: string;
  tokenPreview: string;
  portalId?: number;
  uiDomain?: string;
  accountType?: string;
  isDefault: boolean;
  created_at: string;
};

type ListResponse = {
  ok: boolean;
  connections: HubspotConnection[];
  error?: string;
};

type Props = {
  onConnectionsChange?: () => void;
};

export function HubspotAccountsPanel({ onConnectionsChange }: Props) {
  const [connections, setConnections] = useState<HubspotConnection[]>([]);
  const [statusLoading, setStatusLoading] = useState(true);
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const notify = useCallback(() => {
    onConnectionsChange?.();
  }, [onConnectionsChange]);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hubspot-connection");
      const data = (await res.json()) as ListResponse;
      if (!data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setConnections(data.connections ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const save = async () => {
    if (!token.trim()) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/hubspot-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), label: label.trim() || undefined }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        connection?: HubspotConnection;
        account?: { portalId?: number; uiDomain?: string };
        replaced?: boolean;
        error?: string;
      };
      if (!data.ok || !data.connection) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setToken("");
      setLabel("");
      const verb = data.replaced ? "Updated" : "Connected to";
      setInfo(
        data.account?.portalId
          ? `${verb} HubSpot portal ${data.account.portalId}${
              data.account.uiDomain ? ` (${data.account.uiDomain})` : ""
            }.`
          : `${verb} HubSpot.`,
      );
      await loadStatus();
      notify();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async (id: string) => {
    setBusyId(id);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/hubspot-connection?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setInfo("Disconnected.");
      await loadStatus();
      notify();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const setDefault = async (id: string) => {
    setBusyId(id);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/hubspot-connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isDefault: true }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      await loadStatus();
      notify();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const hasAny = connections.length > 0;
  const defaultConn = connections.find((c) => c.isDefault) ?? null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Connected portals</CardTitle>
          <CardDescription>
            The default account is used for imports unless you pick another on the import page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statusLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </p>
          ) : hasAny ? (
            <div className="space-y-2">
              {connections.map((c) => {
                const isBusy = busyId === c.id;
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{c.label}</p>
                          {c.isDefault && (
                            <Badge variant="secondary" className="text-[10px] uppercase">
                              Default
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.portalId ? `Portal ${c.portalId}` : "Portal —"}
                          {c.uiDomain ? ` · ${c.uiDomain}` : ""}
                          <span className="ml-1 font-mono">· {c.tokenPreview}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!c.isDefault && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDefault(c.id)}
                          disabled={isBusy}
                          title="Set as default"
                        >
                          {isBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Star className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => disconnect(c.id)}
                        disabled={isBusy}
                        title="Disconnect"
                      >
                        {isBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
              {!defaultConn && (
                <p className="mt-2 text-xs text-muted-foreground">
                  No default selected — imports will use the most recently added account.
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-md border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
              No HubSpot connection configured. Add one below to start importing.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{hasAny ? "Add another account" : "Connect HubSpot"}</CardTitle>
          <CardDescription>
            Paste a private app access token. It&apos;s validated against HubSpot before saving.
            Adding a token for a portal you&apos;ve already connected replaces it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="hs-label">Label (optional)</Label>
            <Input
              id="hs-label"
              placeholder="e.g. Acme Production"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hs-token">Access token</Label>
            <Input
              id="hs-token"
              type="password"
              placeholder="pat-na2-••••••••••••••••"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={saving}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Generate one at HubSpot → Settings → Integrations → Private Apps. Needed scopes depend
              on what you&apos;ll import (e.g.{" "}
              <code className="rounded bg-muted px-1">crm.objects.deals.write</code>,{" "}
              <code className="rounded bg-muted px-1">crm.schemas.deals.read</code>).
            </p>
          </div>
          <Button onClick={save} disabled={saving || !token.trim()}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Validating…
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {hasAny ? "Add account" : "Connect"}
              </>
            )}
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {info && <p className="text-sm text-muted-foreground">{info}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
