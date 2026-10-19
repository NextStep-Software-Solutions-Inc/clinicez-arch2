import { z } from "zod";

/**
 * Wire vocabulary of portal-api. Every enum travels as its C# member name (PascalCase) and numbers are never
 * accepted, so each schema lists the exact strings. Keep these in step with the enums in portal-api and the shared SDK.
 */

/** `FacilityType` (shared SDK). */
export const facilityKindSchema = z.enum(["Clinic", "Organization", "Laboratory", "Pharmacy"]);
export type FacilityKind = z.infer<typeof facilityKindSchema>;

/** `FacilityStatus`. */
export const facilityStatusSchema = z.enum(["Provisioning", "Active", "Suspended", "Failed"]);
export type FacilityStatus = z.infer<typeof facilityStatusSchema>;

/** `FacilityDeploymentMode`. */
export const deploymentModeSchema = z.enum(["SharedCloud", "OnPremise"]);
export type FacilityDeploymentMode = z.infer<typeof deploymentModeSchema>;

/** `FacilityVisibility` (shared SDK). */
export const facilityVisibilitySchema = z.enum(["Private", "Network", "Public"]);
export type FacilityVisibility = z.infer<typeof facilityVisibilitySchema>;

/** `LinkStatus` (shared SDK). */
export const linkStatusSchema = z.enum(["Pending", "Active", "Rejected", "Revoked"]);
export type LinkStatus = z.infer<typeof linkStatusSchema>;

/** The members of the `LinkScopes` flags enum, as the link DTOs list them. */
export const linkScopeSchema = z.enum(["LabOrder", "Prescription", "Referral", "Result"]);
export type LinkScope = z.infer<typeof linkScopeSchema>;

/** Not an enum in portal-api: the link DTO labels the viewer's side with these two literals. */
export const linkDirectionSchema = z.enum(["outgoing", "incoming"]);
export type LinkDirection = z.infer<typeof linkDirectionSchema>;

/** `OwnershipTransferStatus`. */
export const ownershipTransferStatusSchema = z.enum(["Pending", "Accepted", "Declined", "Cancelled", "Expired"]);
export type OwnershipTransferStatus = z.infer<typeof ownershipTransferStatusSchema>;

/** `SubscriptionStatus`, as the entitlements endpoint reports it (the billing endpoint keeps its legacy upper-case spelling). */
export const entitlementStatusSchema = z.enum(["Trialing", "Active", "PastDue", "Cancelled", "Expired"]);
export type EntitlementStatus = z.infer<typeof entitlementStatusSchema>;

/** `WorkspaceMemberRole`: the role of a member in the workspace itself. */
export const workspaceRoleSchema = z.enum(["Member", "Billing", "Admin", "Owner"]);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

/**
 * One hub client, returned once. The secret is stored by the hub only as a hash; `signingKey` is the base64 of the
 * PEM private key that signs the client's messages (`Messaging__SigningKey`) and is never retrievable again.
 */
export const hubClientCredentialsSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  signingKey: z.string(),
});
export type HubClientCredentials = z.infer<typeof hubClientCredentialsSchema>;

/** `HubEdgeCredentials`: everything an on-premise workspace needs to join the hub. Keys of `services` are service names (clinic, laboratory, pharmacy, organization, billing). */
export const hubEdgeCredentialsSchema = z.object({
  hubUrl: z.string(),
  upstream: hubClientCredentialsSchema.nullish().transform((v) => v ?? null),
  services: z.record(z.string(), hubClientCredentialsSchema),
});
export type HubEdgeCredentials = z.infer<typeof hubEdgeCredentialsSchema>;

/** `HubRotatedCredentials`: the new credentials of a single hub client; `service` is `cell` for the upstream client. */
export const hubRotatedCredentialsSchema = hubClientCredentialsSchema.extend({
  hubUrl: z.string(),
  service: z.string(),
});
export type HubRotatedCredentials = z.infer<typeof hubRotatedCredentialsSchema>;

/** Validates a response against its schema and fails with a readable message when the server sent something unexpected. */
export function parseWire<T>(schema: z.ZodType<T>, data: unknown, what: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.length ? ` at ${first.path.join(".")}` : "";
    throw new Error(`Unexpected ${what} from the server${where}: ${first?.message ?? "invalid data"}.`);
  }
  return result.data;
}
