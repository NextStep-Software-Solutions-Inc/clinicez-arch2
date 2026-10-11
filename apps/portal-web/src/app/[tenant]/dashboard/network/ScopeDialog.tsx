"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { LINK_SCOPES, type LinkScope } from "@/services/link.service";

const SCOPE_LABELS: Record<LinkScope, string> = {
  LabOrder: "Lab orders",
  Prescription: "Prescriptions",
  Referral: "Referrals",
  Result: "Results",
};

export function scopeLabel(scope: LinkScope): string {
  return SCOPE_LABELS[scope];
}

export interface SourceOption {
  id: string;
  name: string;
}

interface ScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** Scopes that can be chosen; defaults to all of them. */
  availableScopes?: readonly LinkScope[];
  /** When given, the user also picks which of their facilities is the source of the link. */
  sources?: SourceOption[];
  onConfirm: (scopes: LinkScope[], sourceFacilityId: string) => Promise<void>;
}

/** Picks the scopes of a link, and optionally the own facility it starts from. Used to request and to approve. */
export function ScopeDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  availableScopes = LINK_SCOPES,
  sources,
  onConfirm,
}: ScopeDialogProps) {
  const [chosen, setChosen] = useState<LinkScope[]>([...availableScopes]);
  const [sourceId, setSourceId] = useState(sources?.[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  const toggle = (scope: LinkScope, on: boolean) =>
    setChosen((prev) => (on ? [...prev, scope] : prev.filter((s) => s !== scope)));

  const needsSource = sources !== undefined;
  const canConfirm = chosen.length > 0 && (!needsSource || sourceId !== "") && !busy;

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(chosen, sourceId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {needsSource && (
            <div className="space-y-1.5">
              <Label htmlFor="link-source" className="text-xs font-bold">Your facility</Label>
              {sources.length === 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">You have no active facility that can start a link.</p>
              ) : (
                <select
                  id="link-source"
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="h-9 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <fieldset className="space-y-2">
            <legend className="text-xs font-bold">What may be shared</legend>
            {availableScopes.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={chosen.includes(scope)} onCheckedChange={(v) => toggle(scope, v === true)} />
                {SCOPE_LABELS[scope]}
              </label>
            ))}
            {chosen.length === 0 && <p className="text-[11px] text-rose-600">Choose at least one.</p>}
          </fieldset>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canConfirm} onClick={confirm}>
            {busy ? "Working..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
