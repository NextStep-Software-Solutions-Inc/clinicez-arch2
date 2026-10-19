"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { IconCrown, IconUsers } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { RoleChip } from "@/components/dashboard/RoleChip";
import { describeApiError } from "@/lib/apiError";
import { toastApiError } from "@/lib/apiToast";
import { staffService, type StaffMemberDto } from "@/services/staff.service";
import { tenantService, type OwnershipTransfer } from "@/services/tenant.service";

const swrOptions = { revalidateOnFocus: false, shouldRetryOnError: false } as const;

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

interface OwnerPanelProps {
  tenantSlug: string;
  offer: OwnershipTransfer | null | undefined;
  members: StaffMemberDto[];
  onChanged: () => Promise<unknown>;
}

function OwnerPanel({ tenantSlug, offer, members, onChanged }: OwnerPanelProps) {
  const candidates = members.filter((m) => m.status === "Active" && !!m.userId && m.role !== "Owner");
  const [targetId, setTargetId] = useState("");
  const [confirmSlug, setConfirmSlug] = useState("");
  const [busy, setBusy] = useState(false);

  const offerTransfer = async () => {
    setBusy(true);
    try {
      await tenantService.offerOwnershipTransfer(tenantSlug, { targetStaffMemberId: targetId, confirmSlug: confirmSlug.trim() });
      toast.success("Ownership offer sent. It stays open for 7 days.");
      setTargetId("");
      setConfirmSlug("");
      await onChanged();
    } catch (err: unknown) {
      toastApiError(err, "The ownership offer could not be sent", tenantSlug);
    } finally {
      setBusy(false);
    }
  };

  const cancelOffer = async () => {
    setBusy(true);
    try {
      await tenantService.cancelOwnershipTransfer(tenantSlug);
      toast.success("Ownership offer cancelled.");
      await onChanged();
    } catch (err: unknown) {
      toastApiError(err, "The offer could not be cancelled", tenantSlug);
    } finally {
      setBusy(false);
    }
  };

  if (offer) {
    return (
      <Card className="rounded-3xl border-violet-200 dark:border-violet-900 shadow-sm bg-white dark:bg-slate-950">
        <CardHeader className="p-6 pb-3">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <IconCrown className="h-5 w-5 text-violet-600" /> Offer pending
          </CardTitle>
          <CardDescription className="text-xs font-medium text-slate-500">
            Waiting for {offer.targetName} ({offer.targetEmail}) to answer. You stay the owner until they accept.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-3 space-y-4">
          <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Offered</dt>
              <dd className="mt-0.5 font-medium">{formatDateTime(offer.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expires</dt>
              <dd className="mt-0.5 font-medium">{formatDateTime(offer.expiresAt)}</dd>
            </div>
          </dl>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void cancelOffer()} className="rounded-xl text-xs font-bold">
            {busy ? "Cancelling..." : "Cancel offer"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const canOffer = targetId !== "" && confirmSlug.trim().toLowerCase() === tenantSlug.toLowerCase() && !busy;

  return (
    <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
      <CardHeader className="p-6 pb-3">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          <IconCrown className="h-5 w-5" /> Hand over ownership
        </CardTitle>
        <CardDescription className="text-xs font-medium text-slate-500">
          The new owner must be an active member who does not own another workspace. They have to accept the offer, and nothing changes
          until they do. Offers expire after 7 days.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 pt-3 space-y-4">
        {candidates.length === 0 ? (
          <p className="text-sm text-slate-500">
            There is no eligible member. Invite someone from the team page and wait for them to accept the invitation first.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="ownership-target" className="text-xs font-bold">New owner</Label>
              <select
                id="ownership-target"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="h-10 w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Choose a member</option>
                {candidates.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} ({m.email}) · {m.role}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ownership-confirm" className="text-xs font-bold">
                Type <span className="font-mono">{tenantSlug}</span> to confirm
              </Label>
              <Input
                id="ownership-confirm"
                value={confirmSlug}
                onChange={(e) => setConfirmSlug(e.target.value)}
                autoComplete="off"
                className="h-10 max-w-md rounded-xl text-sm font-mono"
              />
            </div>
            <Button type="button" disabled={!canOffer} onClick={() => void offerTransfer()} className="rounded-xl text-xs font-bold">
              {busy ? "Sending..." : "Offer ownership"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface TargetPanelProps {
  tenantSlug: string;
  offer: OwnershipTransfer;
  onChanged: () => Promise<unknown>;
}

function TargetPanel({ tenantSlug, offer, onChanged }: TargetPanelProps) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy("accept");
    setError(null);
    try {
      await tenantService.acceptOwnershipTransfer(tenantSlug);
      toast.success("You are now the owner of this workspace.");
      window.location.assign(`/${tenantSlug}/dashboard/ownership`);
    } catch (err: unknown) {
      setError(describeApiError(err, "The offer could not be accepted").message);
      setBusy(null);
    }
  };

  const decline = async () => {
    setBusy("decline");
    setError(null);
    try {
      await tenantService.declineOwnershipTransfer(tenantSlug);
      toast.success("Offer declined.");
      await onChanged();
    } catch (err: unknown) {
      setError(describeApiError(err, "The offer could not be declined").message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="rounded-3xl border-violet-200 dark:border-violet-900 shadow-sm bg-white dark:bg-slate-950">
      <CardHeader className="p-6 pb-3">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          <IconCrown className="h-5 w-5 text-violet-600" /> You have been offered ownership
        </CardTitle>
        <CardDescription className="text-xs font-medium text-slate-500">
          Accepting makes you the owner of this workspace, with control of billing, members and the archive. The current owner becomes an
          Admin. The offer expires {formatDateTime(offer.expiresAt)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 pt-3 space-y-4">
        {error && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy !== null} onClick={() => void accept()} className="rounded-xl text-xs font-bold">
            {busy === "accept" ? "Accepting..." : "Accept ownership"}
          </Button>
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void decline()} className="rounded-xl text-xs font-bold">
            {busy === "decline" ? "Declining..." : "Decline"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface OwnershipClientProps {
  tenantSlug: string;
  /** The viewer's role in this workspace. */
  role: string;
}

export default function OwnershipClient({ tenantSlug, role }: OwnershipClientProps) {
  const isOwner = role === "Owner";
  const canSeeMembers = isOwner || role === "Admin";

  const {
    data: offer,
    isLoading: offerLoading,
    mutate: mutateOffer,
  } = useSWR(`ownership-transfer/${tenantSlug}`, () => tenantService.getOwnershipTransfer(tenantSlug), swrOptions);
  const { data: staff, isLoading: staffLoading } = useSWR(
    canSeeMembers ? `ownership-members/${tenantSlug}` : null,
    () => staffService.getTenantStaff(tenantSlug),
    swrOptions,
  );

  const members = staff?.members ?? [];

  return (
    <div className="w-full flex-1 flex flex-col gap-6 sm:gap-8 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto animate-in fade-in-50 duration-300">
      <div className="border-b pb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Ownership</h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1">
          Hand this workspace to another member, or answer an offer made to you.
        </p>
      </div>

      {offerLoading && <Skeleton className="h-48 w-full rounded-3xl" />}

      {!offerLoading && isOwner && (
        <OwnerPanel tenantSlug={tenantSlug} offer={offer} members={members} onChanged={() => mutateOffer()} />
      )}

      {!offerLoading && !isOwner && offer && <TargetPanel tenantSlug={tenantSlug} offer={offer} onChanged={() => mutateOffer()} />}

      {!offerLoading && !isOwner && !offer && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-sm text-slate-600 dark:text-slate-300">
          Only the workspace owner can hand it over. If the owner offers it to you, the offer shows up here and as a banner on every page.
        </div>
      )}

      {canSeeMembers && (
        <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
          <CardHeader className="p-6 pb-3">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <IconUsers className="h-5 w-5" /> Members
            </CardTitle>
            <CardDescription className="text-xs font-medium text-slate-500">
              Everyone with access to this workspace and their role. Change roles on the team page.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-3">
            {staffLoading && <Skeleton className="h-24 w-full rounded-2xl" />}
            {!staffLoading && members.length === 0 && <p className="text-sm text-slate-500">No members to show.</p>}
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{m.fullName}</p>
                    <p className="text-xs text-slate-500 truncate">{m.email}</p>
                  </div>
                  <RoleChip role={m.role} />
                  {m.status !== "Active" && <span className="text-[11px] text-slate-400">{m.status}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
