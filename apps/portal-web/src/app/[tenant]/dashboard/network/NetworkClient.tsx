"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { IconArrowsExchange, IconSearch, IconWorld } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useEntitlements } from "@/hooks/useEntitlements";
import { describeApiError } from "@/lib/apiError";
import { toastApiError } from "@/lib/apiToast";
import { ENTITLEMENT_KEYS } from "@/services/entitlement.service";
import { facilityService, type FacilityKind } from "@/services/facility.service";
import { linkService, type DirectoryFacility, type FacilityLink, type LinkScope, type LinkStatus } from "@/services/link.service";
import { ScopeDialog, scopeLabel } from "./ScopeDialog";

const FACILITY_TYPES: FacilityKind[] = ["Clinic", "Laboratory", "Pharmacy", "Organization"];

const STATUS_TONE: Record<LinkStatus, string> = {
  Pending: "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
  Active: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
  Rejected: "border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
  Revoked: "border-slate-300 bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300",
};

function StatusChip({ status }: { status: LinkStatus }) {
  return (
    <Badge variant="outline" className={`text-[10px] font-bold ${STATUS_TONE[status]}`}>
      {status}
    </Badge>
  );
}

const selectClass =
  "h-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary";

interface NetworkClientProps {
  tenantSlug: string;
}

export default function NetworkClient({ tenantSlug }: NetworkClientProps) {
  const { hasFeature } = useEntitlements(tenantSlug);
  const interopAvailable = hasFeature(ENTITLEMENT_KEYS.crossTenantInterop);

  const linksKey = `links/${tenantSlug}`;
  const {
    data: links,
    error: linksError,
    isLoading: linksLoading,
    mutate: mutateLinks,
  } = useSWR(linksKey, () => linkService.getLinks(tenantSlug), { revalidateOnFocus: false, shouldRetryOnError: false });
  const { data: facilities } = useSWR(`link-facilities/${tenantSlug}`, () => facilityService.getFacilities(tenantSlug), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const linksForbidden = (linksError as { response?: { status?: number } } | undefined)?.response?.status === 403;

  const [type, setType] = useState<FacilityKind | "">("");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [hits, setHits] = useState<DirectoryFacility[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  const [requestTarget, setRequestTarget] = useState<DirectoryFacility | null>(null);
  const [approveTarget, setApproveTarget] = useState<FacilityLink | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<FacilityLink | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null);

  const activeFacilities = (facilities ?? []).filter((f) => f.status === "Active").map((f) => ({ id: f.id, name: f.name }));

  const search = async () => {
    setSearching(true);
    setDirectoryError(null);
    try {
      setHits(await linkService.searchDirectory(tenantSlug, { type: type || undefined, q: query, city }));
    } catch (err: unknown) {
      const info = describeApiError(err, "The directory could not be searched");
      setHits(null);
      setDirectoryError(
        info.status === 502 ? "The directory could not be reached right now. Try again in a moment." : info.message,
      );
    } finally {
      setSearching(false);
    }
  };

  const markRequested = (facilityId: string, status: LinkStatus) =>
    setHits((prev) => prev?.map((h) => (h.facilityId === facilityId ? { ...h, linkStatus: status } : h)) ?? null);

  const sendRequest = async (target: DirectoryFacility, scopes: LinkScope[], sourceFacilityId: string) => {
    try {
      const link = await linkService.requestLink(tenantSlug, { sourceFacilityId, targetFacilityId: target.facilityId, scopes });
      toast.success(
        link.status === "Active"
          ? `Linked with ${target.displayName}.`
          : `Request sent. ${target.displayName} has to approve it before it becomes active.`,
      );
      markRequested(target.facilityId, link.status);
      setRequestTarget(null);
      await mutateLinks();
    } catch (err: unknown) {
      toastApiError(err, "The link could not be requested", tenantSlug);
    }
  };

  const approve = async (link: FacilityLink, scopes: FacilityLink["scopes"]) => {
    try {
      await linkService.approveLink(tenantSlug, link.id, scopes);
      toast.success(`Link with ${link.sourceFacilityName} approved.`);
      setApproveTarget(null);
      await mutateLinks();
    } catch (err: unknown) {
      toastApiError(err, "The link could not be approved", tenantSlug);
    }
  };

  const reject = async (link: FacilityLink) => {
    setBusyLinkId(link.id);
    try {
      await linkService.rejectLink(tenantSlug, link.id);
      toast.success(`Request from ${link.sourceFacilityName} rejected.`);
      await mutateLinks();
    } catch (err: unknown) {
      toastApiError(err, "The request could not be rejected", tenantSlug);
    } finally {
      setBusyLinkId(null);
    }
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await linkService.revokeLink(tenantSlug, revokeTarget.id);
      toast.success("Link ended.");
      setRevokeTarget(null);
      await mutateLinks();
    } catch (err: unknown) {
      toastApiError(err, "The link could not be ended", tenantSlug);
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col gap-6 sm:gap-8 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto animate-in fade-in-50 duration-300">
      <div className="border-b pb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Network</h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1">
          Find facilities in other workspaces, and decide which of your facilities exchange orders, prescriptions, referrals and results with them.
        </p>
      </div>

      {interopAvailable === false && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-4 text-sm text-amber-800 dark:text-amber-300">
          Links with other workspaces are not part of your current plan. You can still end or review existing links.{" "}
          <Link href={`/${tenantSlug}/dashboard/plan`} className="font-semibold underline">
            View plans
          </Link>
        </div>
      )}

      <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
        <CardHeader className="p-6 pb-3">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <IconWorld className="h-5 w-5" /> Directory
          </CardTitle>
          <CardDescription className="text-xs font-medium text-slate-500">
            Only facilities whose workspace made them public or network-visible are listed. Make your own facilities findable in Settings → Facilities.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-3 space-y-4">
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <select aria-label="Facility type" value={type} onChange={(e) => setType(e.target.value as FacilityKind | "")} className={selectClass}>
              <option value="">Any type</option>
              {FACILITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Input
              aria-label="Facility name"
              placeholder="Name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 rounded-xl text-xs flex-1 min-w-40"
            />
            <Input
              aria-label="City"
              placeholder="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="h-9 rounded-xl text-xs w-40"
            />
            <Button type="submit" size="sm" disabled={searching} className="rounded-xl text-xs font-bold gap-1.5">
              <IconSearch className="h-3.5 w-3.5" />
              {searching ? "Searching..." : "Search"}
            </Button>
          </form>

          {directoryError && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50/50 dark:bg-red-950/20 p-4 text-sm text-red-700 dark:text-red-300">
              <span>{directoryError}</span>
              <Button type="button" size="sm" variant="outline" disabled={searching} onClick={() => void search()} className="rounded-xl text-xs">
                Try again
              </Button>
            </div>
          )}

          {hits && hits.length === 0 && <p className="text-sm text-slate-500">No facilities matched your search.</p>}

          {hits && hits.length > 0 && (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {hits.map((hit) => {
                const linked = hit.linkStatus === "Pending" || hit.linkStatus === "Active";
                return (
                  <li key={hit.facilityId} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{hit.displayName}</p>
                      <p className="text-xs text-slate-500">
                        {hit.facilityType}
                        {hit.city && ` · ${hit.city}`}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{hit.visibility}</Badge>
                    {hit.acceptsExternalRequests && (
                      <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 dark:text-emerald-300">
                        Accepts requests
                      </Badge>
                    )}
                    {hit.isOwnWorkspace && <Badge variant="secondary" className="text-[10px]">Your workspace</Badge>}
                    {hit.linkStatus && <StatusChip status={hit.linkStatus} />}
                    <Button
                      type="button"
                      size="sm"
                      disabled={hit.isOwnWorkspace || linked || interopAvailable === false}
                      onClick={() => setRequestTarget(hit)}
                      className="rounded-xl text-xs font-bold"
                    >
                      Request link
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
        <CardHeader className="p-6 pb-3">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <IconArrowsExchange className="h-5 w-5" /> Links
          </CardTitle>
          <CardDescription className="text-xs font-medium text-slate-500">
            Outgoing links start from one of your facilities, incoming links are requests from other workspaces.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-3">
          {linksLoading && <Skeleton className="h-32 w-full rounded-2xl" />}
          {linksForbidden && (
            <p className="rounded-2xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-4 text-sm text-amber-800 dark:text-amber-300">
              Only the workspace Owner or an Admin can manage links.
            </p>
          )}
          {!linksLoading && !linksForbidden && linksError && (
            <p className="text-sm text-red-600">Links could not be loaded. Please refresh and try again.</p>
          )}
          {links && links.length === 0 && <p className="text-sm text-slate-500">No links yet. Search the directory to request one.</p>}
          {links && links.length > 0 && (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {links.map((link) => {
                const incomingPending = link.direction === "incoming" && link.status === "Pending";
                const endable = link.status === "Pending" || link.status === "Active";
                const busy = busyLinkId === link.id;
                return (
                  <li key={link.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-semibold">
                        {link.sourceFacilityName} <span className="text-slate-400">→</span> {link.targetFacilityName}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {link.direction === "incoming" ? "Incoming" : "Outgoing"}
                        </Badge>
                        {link.scopes.map((s) => (
                          <Badge key={s} variant="secondary" className="text-[10px]">{scopeLabel(s)}</Badge>
                        ))}
                        <span className="text-[11px] text-slate-400">{new Date(link.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <StatusChip status={link.status} />
                    {incomingPending && (
                      <>
                        <Button type="button" size="sm" disabled={busy} onClick={() => setApproveTarget(link)} className="rounded-xl text-xs font-bold">
                          Approve
                        </Button>
                        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void reject(link)} className="rounded-xl text-xs font-bold">
                          Reject
                        </Button>
                      </>
                    )}
                    {endable && !incomingPending && (
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setRevokeTarget(link)} className="rounded-xl text-xs font-bold">
                        {link.status === "Pending" ? "Cancel request" : "Revoke"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {requestTarget && (
        <ScopeDialog
          open
          onOpenChange={(open) => !open && setRequestTarget(null)}
          title={`Request a link with ${requestTarget.displayName}`}
          description="Choose your facility and what it may exchange with them. They can narrow the scopes when they approve."
          confirmLabel="Send request"
          sources={activeFacilities}
          onConfirm={(scopes, sourceFacilityId) => sendRequest(requestTarget, scopes, sourceFacilityId)}
        />
      )}

      {approveTarget && (
        <ScopeDialog
          open
          onOpenChange={(open) => !open && setApproveTarget(null)}
          title={`Approve ${approveTarget.sourceFacilityName}`}
          description="Untick anything you do not want to exchange with this facility."
          confirmLabel="Approve"
          availableScopes={approveTarget.scopes}
          onConfirm={(scopes) => approve(approveTarget, scopes)}
        />
      )}

      <Dialog open={revokeTarget !== null} onOpenChange={(open) => !open && !revoking && setRevokeTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{revokeTarget?.status === "Pending" ? "Cancel this request?" : "End this link?"}</DialogTitle>
            <DialogDescription>
              {revokeTarget && (
                <>
                  {revokeTarget.sourceFacilityName} and {revokeTarget.targetFacilityName} will stop exchanging data. A new link has to be requested and approved again.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={revoking} onClick={() => setRevokeTarget(null)}>
              Keep it
            </Button>
            <Button type="button" variant="destructive" disabled={revoking} onClick={() => void revoke()}>
              {revoking ? "Ending..." : revokeTarget?.status === "Pending" ? "Cancel request" : "End link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
