import React, { useEffect, useState } from "react";
import { createRoute, useNavigate } from "@tanstack/react-router";
import { IconArrowLeft, IconShieldLock } from "@tabler/icons-react";
import { Route as authRoute } from "../_auth";
import {
  buildVerificationsQueueHref,
  parseVerificationQueueSearch,
  type VerificationQueueSearch,
} from "@/lib/verificationStatus";
import {
  canViewVerifications,
  verificationService,
  type ReviewerProfile,
  type VerificationRequestDetailDto,
} from "@/services/verification.service";
import { VerificationDetailWorkspace } from "@/components/verifications/VerificationReviewDrawer";

export function VerificationDetailPageView({
  requestId,
  queueSearch,
  initialProfile,
  initialDetail,
}: {
  requestId: string;
  queueSearch?: VerificationQueueSearch;
  initialProfile?: ReviewerProfile | null;
  initialDetail?: VerificationRequestDetailDto | null;
}) {
  let navigate: ReturnType<typeof useNavigate> | null = null;
  try {
    navigate = useNavigate();
  } catch {
    // Outside RouterProvider in unit tests
  }

  const [profile, setProfile] = useState<ReviewerProfile | null | undefined>(initialProfile);
  const [profileLoading, setProfileLoading] = useState(initialProfile === undefined);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (initialProfile !== undefined) return;
    let cancelled = false;
    setProfileLoading(true);
    setProfileError(null);
    verificationService
      .getReviewerProfile()
      .then((res) => {
        if (!cancelled) setProfile(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setProfile(null);
          setProfileError(err instanceof Error ? err.message : "Failed to verify reviewer access.");
        }
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialProfile]);

  const hasAccess = canViewVerifications(profile);
  const backHref = buildVerificationsQueueHref(queueSearch);

  if (profileLoading) {
    return (
      <div className="space-y-6 animate-pulse" aria-label="Loading verification detail workspace">
        <div className="h-20 w-full rounded-2xl bg-surface-muted" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 space-y-4">
            <div className="h-44 rounded-2xl bg-surface-muted" />
            <div className="h-56 rounded-2xl bg-surface-muted" />
          </div>
          <div className="lg:col-span-6">
            <div className="h-[560px] rounded-2xl bg-surface-muted" />
          </div>
        </div>
      </div>
    );
  }

  if (!hasAccess || !profile) {
    return (
      <div className="py-16 flex items-center justify-center">
        <div className="max-w-md w-full rounded-2xl border border-border bg-surface p-8 text-center space-y-4 shadow-sm">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center">
            <IconShieldLock className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold text-text">Directory Verification Access Required</h1>
            <p className="text-xs text-text-muted leading-relaxed">
              {profileError ||
                "Your administrator role does not include the view:verifications permission required to inspect clinic and practitioner directory requests."}
            </p>
          </div>
          <div className="pt-1 flex justify-center">
            <a
              href={backHref}
              onClick={(e) => {
                if (navigate) {
                  e.preventDefault();
                  void navigate({ to: "/verifications", search: queueSearch ?? {} });
                }
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-text bg-surface-muted border border-border hover:bg-surface transition-colors"
            >
              <IconArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Directory Verifications</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <VerificationDetailWorkspace
      key={requestId}
      requestId={requestId}
      profile={profile}
      queueSearch={queueSearch}
      initialDetail={initialDetail}
    />
  );
}

function VerificationDetailPage() {
  const { requestId } = Route.useParams();
  const queueSearch = Route.useSearch();
  return <VerificationDetailPageView requestId={requestId} queueSearch={queueSearch} />;
}

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: "verifications/$requestId",
  validateSearch: parseVerificationQueueSearch,
  component: VerificationDetailPage,
});
