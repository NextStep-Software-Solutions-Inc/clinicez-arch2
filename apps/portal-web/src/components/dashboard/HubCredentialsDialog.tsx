"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { IconCheck, IconCopy, IconKey } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { HubEdgeCredentials, HubRotatedCredentials } from "@/services/facility.service";

interface CredentialRow {
  label: string;
  clientId: string;
  clientSecret: string;
}

interface ShownCredentials {
  title: string;
  facilityName: string;
  hubUrl: string;
  rows: CredentialRow[];
}

interface HubCredentialsContextValue {
  /** Shows the credentials returned when the first on-premise facility is created. */
  showEdge: (facilityName: string, credentials: HubEdgeCredentials) => void;
  /** Shows the single hub client secret returned by a rotation. */
  showRotated: (facilityName: string, rotated: HubRotatedCredentials) => void;
}

const HubCredentialsContext = createContext<HubCredentialsContextValue | null>(null);

export function useHubCredentials(): HubCredentialsContextValue {
  const ctx = useContext(HubCredentialsContext);
  if (!ctx) throw new Error("useHubCredentials must be used inside HubCredentialsProvider");
  return ctx;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy. Select the value and copy it manually.");
    }
  };

  return (
    <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={copy} aria-label={`Copy ${label}`}>
      {copied ? <IconCheck className="h-4 w-4 text-emerald-600" /> : <IconCopy className="h-4 w-4" />}
    </Button>
  );
}

function ValueLine({ caption, value }: { caption: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{caption}</p>
        <p className="truncate rounded-lg bg-slate-50 px-2 py-1.5 font-mono text-xs dark:bg-slate-900" title={value}>
          {value}
        </p>
      </div>
      <CopyButton value={value} label={caption} />
    </div>
  );
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Holds hub credentials in component state only and shows them in a dialog that cannot be dismissed until the
 * user confirms they saved them. Nothing is written to storage, the URL or a cache; closing clears the state.
 */
export function HubCredentialsProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<ShownCredentials | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const open = useCallback((next: ShownCredentials) => {
    setConfirmed(false);
    setShown(next);
  }, []);

  const showEdge = useCallback(
    (facilityName: string, credentials: HubEdgeCredentials) => {
      const rows: CredentialRow[] = [];
      if (credentials.upstream) {
        rows.push({ label: "Upstream (cell)", ...credentials.upstream });
      }
      for (const [service, secret] of Object.entries(credentials.services)) {
        rows.push({ label: titleCase(service), ...secret });
      }
      open({ title: "On-premise hub credentials", facilityName, hubUrl: credentials.hubUrl, rows });
    },
    [open],
  );

  const showRotated = useCallback(
    (facilityName: string, rotated: HubRotatedCredentials) => {
      open({
        title: "New hub client secret",
        facilityName,
        hubUrl: rotated.hubUrl,
        rows: [{ label: titleCase(rotated.service), clientId: rotated.clientId, clientSecret: rotated.clientSecret }],
      });
    },
    [open],
  );

  const value = useMemo(() => ({ showEdge, showRotated }), [showEdge, showRotated]);

  const finish = () => {
    setShown(null);
    setConfirmed(false);
  };

  return (
    <HubCredentialsContext.Provider value={value}>
      {children}
      <Dialog open={shown !== null} onOpenChange={() => undefined}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconKey className="h-5 w-5 text-amber-600" />
              {shown?.title}
            </DialogTitle>
            <DialogDescription>
              For <strong>{shown?.facilityName}</strong>. These secrets are shown only once and cannot be retrieved later. If you lose
              them you will have to rotate them, which invalidates the old ones.
            </DialogDescription>
          </DialogHeader>

          {shown && (
            <div className="space-y-4">
              <ValueLine caption="Hub URL" value={shown.hubUrl} />
              {shown.rows.map((row) => (
                <div key={row.label} className="space-y-2 rounded-2xl border border-slate-100 p-3 dark:border-slate-800">
                  <p className="text-sm font-bold">{row.label}</p>
                  <ValueLine caption="Client ID" value={row.clientId} />
                  <ValueLine caption="Client secret" value={row.clientSecret} />
                </div>
              ))}
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
            <span>I saved these credentials in a safe place.</span>
          </label>

          <DialogFooter>
            <Button type="button" disabled={!confirmed} onClick={finish}>
              I saved these
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HubCredentialsContext.Provider>
  );
}
