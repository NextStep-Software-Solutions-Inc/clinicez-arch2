import { headers } from "next/headers";
import { getPortalApiUrl } from "@/utils/domain";
import { preflightInvite, type PreflightInviteResult } from "./preflightInvite";

/** Runs invite preflight on the server using incoming request headers to derive portal-api host. */
export async function preflightInviteOnServer(
  inviteToken: string
): Promise<PreflightInviteResult> {
  let requestHost: string | undefined;
  try {
    const hdrs = await headers();
    requestHost = hdrs.get("x-forwarded-host") || hdrs.get("host") || undefined;
  } catch {
    requestHost = undefined;
  }
  return preflightInvite(inviteToken, getPortalApiUrl(requestHost));
}
