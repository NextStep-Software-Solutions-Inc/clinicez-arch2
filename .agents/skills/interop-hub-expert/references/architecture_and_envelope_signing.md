# Interop Hub Architecture & Envelope Signing Reference

This reference document details the canonical data structures, security rules, signing algorithms, and delivery pipeline of the ClinicEZ Interop Hub.

---

## 1. Envelope Structure (`InteropEnvelope`)

Every interop communication uses the canonical envelope definition defined in [`InteropEnvelope.cs`](../../../../packages/shared-dotnet/Interop/InteropEnvelope.cs):

```csharp
public class InteropEnvelope
{
    public Guid MessageId { get; set; }
    public string CorrelationId { get; set; } = string.Empty;
    public string MessageType { get; set; } = string.Empty;
    public int SchemaVersion { get; set; } = 1;
    public Party From { get; set; } = null!;
    public Party To { get; set; } = null!;
    public Party? SignedTo { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public string PayloadJson { get; set; } = string.Empty;
    public string? SignerKeyId { get; set; }
    public string? Signature { get; set; }
}
```

---

## 2. ECDSA P-256 Envelope Signing Protocol

- **Canonical Format (`clinicez-envelope-v1`)**:
  The signed string is formatted canonical text comprising length-prefixed strings:
  `clinicez-envelope-v1\n` +
  `MessageId\n` +
  `CorrelationId\n` +
  `MessageType\n` +
  `SchemaVersion\n` +
  `From.ToString()\n` +
  `(SignedTo ?? To).ToString()\n` +
  `CreatedAtUtc (ISO-8601)\n` +
  `ExpiresAtUtc (ISO-8601)\n` +
  `SignerKeyId\n` +
  `SHA256(CanonicalPayloadJson)\n`

- **Signing (`EnvelopeSigner.cs`)**:
  Signed using ECDSA with P-256 curve and SHA-256 hash algorithm.

- **Verification**:
  1. Sending client signs outbox envelope using `Messaging:SigningKey`.
  2. Hub verifies envelope signature against registered public key `Clients.PublicKeyPem`.
  3. Destination service long-polls mailbox and verifies sender signature by querying `GET /v1/keys/{signerClientId}` (public keys cached 5 minutes).

---

## 3. Cross-Tenant Routing Rules (`RoutingPolicy.cs`)

Cross-tenant messages between facilities are governed by routing policy:

1. **Same-Tenant Traffic**: Always permitted without link check.
2. **Cross-Tenant Traffic**:
   - **Allowed as Reply**: If target previously addressed sender on same `CorrelationId` (conversation active within 30 days).
   - **Allowed via Active Link**: Requires an `Active` link with scope matching the message pattern:

| Message Pattern | Link Scope Required |
|---|---|
| `lab.order.*` | `LabOrder` |
| `rx.*` | `Prescription` |
| `*referral*` | `Referral` |
| `lab.result.*` | `Result` (or active conversation reply) |
| *Other* | Replies only |

---

## 4. Platform Services (`philhealth-proxy`)

- Platform services are specialized Cloud cell hub clients.
- `philhealth-proxy` client uses `Kind = PlatformService` and service name `philhealth`.
- Restricted message routing (`PlatformMessageRules.cs`):
  - `philhealth.request`: Sent by facilities to `Party.PhilHealth`.
  - `philhealth.response`: Sent by `philhealth-proxy` to requesting facility.
  - `philhealth.config.*`: Management exchanges between `portal-api` and `philhealth-proxy`.

---

## 5. Claims & Token Redemption

Claims enable patient-carried transactions (e.g. digital lab slips, QR e-prescriptions) across facilities without a pre-existing link:

1. Issuing facility calls `POST /v1/claims` with envelope target `To.FacilityType = Laboratory`.
2. Hub stores SHA-256 hash of token and returns token string to caller.
3. Patient presents QR token to redeeming facility.
4. Redeeming facility calls `POST /v1/claims/{token}/redeem`.
5. Hub validates facility type, delivers payload to redeemer, opens correlation conversation for replies, and tombstones token hash.
