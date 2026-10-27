---
name: interop-hub-expert
description: >-
  Comprehensive guide and technical reference for developing, maintaining, and integrating with the ClinicEZ Interop Hub.
  Use this skill when designing interop message types, implementing transactional outbox/inbox handlers (IInteropHandler<T>),
  configuring ECDSA P-256 envelope signing, setting up local or cloud hub mailboxes, enforcing cross-tenant routing policy,
  or troubleshooting interop communications across services.
---

# Interop Hub Expert Skill

The Interop Hub is the sole boundary-crossing communication backbone in ClinicEZ. Services exchange messages wrapped in [`InteropEnvelope`](../../packages/shared-dotnet/Interop/InteropEnvelope.cs) via HTTPS mailboxes in PostgreSQL.

This skill provides step-by-step instructions, design patterns, and reference architectures for working with the Interop Hub.

---

## Core Principles & Architecture Overview

1. **No Direct HTTP / No Message Broker (Sole Exception: `portal <-> patient`)**:
   - Direct inter-service HTTP communication is strictly forbidden across all services **except `portal <-> patient`** in the cloud control plane.
   - Direct HTTP calls between facility microservices (`clinic-api`, `laboratory-api`, `pharmacy-api`, `organization-api`, `billing-api`) are an architectural violation.
   - Every facility service runs in outbound-only on-premise Edge Cells (`Hub:Mode=Local`, zero inbound ports) and MUST communicate exclusively via `services/interop-hub`.
   - Next.js BFF proxy routes (`src/app/api/...`) over `portal-api` or `patient-api` are strictly forbidden in `apps/portal-web`; clients talk directly to APIs using Clerk bearer authentication.
   - All cross-service and cross-cell facility communication uses the `ClinicEz.Shared.Interop` SDK (mailboxes in Postgres).
   - `scripts/check-no-broker.ps1` is enforced in CI to prevent broker regression.

2. **Outbound-Only HTTPS & Zero Inbound Ports**:
   - On-premise Edge Cells require zero inbound open ports. Every local service and Local Hub connects **outbound** over HTTPS to the Cloud Hub.

3. **Topology Modes (`Hub:Mode`)**:
   - **Cloud**: Central routing authority, client auth, directory snapshot master, claims manager, mailbox host.
   - **Local**: Runs at edge sites (LAN), handles intra-site messages locally, queues upstream messages for Cloud, long-polls the site's `cell-inbox`.

4. **Mailbox Naming (`{cellId}:{service}`)**:
   - Standard facility mailboxes: `cloud:clinic`, `cloud:laboratory`, `cloud:pharmacy`, `cloud:organization`, `cloud:billing`.
   - Control plane / Platform mailboxes: `cloud:portal`, `cloud:patient`, `cloud:philhealth`.
   - Edge cell mailboxes: `{edgeCell}:cell-inbox` (fan-out locally to `{edgeCell}:{service}`).

---

## Step-by-Step Instructions

### 1. Registering Interop in a Service (`AddInterop`)

In `Infrastructure/DependencyInjection.cs`:

```csharp
services.AddInterop<ApplicationDbContext>(configuration, handlers => handlers
    .Handle<FacilityCreatedEvent, FacilityLicenseIssuedHandler>(InteropTypes.FacilityLicenseIssued)
    .Handle<LabRequisitionIssuedEvent, LabOrderIssuedHandler>(InteropTypes.LabOrderIssued));
```

In `Persistence/ApplicationDbContext.cs`:

```csharp
public class ApplicationDbContext : DbContext, IInteropDbContext
{
    public DbSet<InteropOutboxMessage> InteropOutbox => Set<InteropOutboxMessage>();
    public DbSet<InteropInboxMessage>  InteropInbox  => Set<InteropInboxMessage>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);
        b.ApplyInteropModel();
    }
}
```

---

### 2. Publishing Messages (Transactional Outbox)

> [!IMPORTANT]
> **Always publish before `SaveChanges`.** `IInteropPublisher.Enqueue(...)` writes to the `interop_outbox` table within the current DbContext transaction. Never enqueue after saving!

```csharp
public async Task<Guid> Handle(CreateLabOrderCommand request, CancellationToken ct)
{
    var order = new LabOrder { ... };
    _dbContext.LabOrders.Add(order);

    // Enqueue message inside the same transaction
    await _publisher.EnqueueAsync(
        messageType: InteropTypes.LabOrderIssued,
        payload: new LabRequisitionIssuedEvent { RequisitionId = order.Id, ... },
        target: Party.ForFacility(request.TenantId, request.TargetFacilityId, FacilityType.Laboratory),
        correlationId: order.Id.ToString(),
        cancellationToken: ct
    );

    // Commit business entity and outbox message together
    await _dbContext.SaveChangesAsync(ct);
    return order.Id;
}
```

---

### 3. Writing Idempotent Envelope Handlers (`IInteropHandler<T>`)

Each handler must adhere to 5 mandatory rules:

1. **Verify Sender & Receiver**: Check `context.From.Kind` (e.g., `ControlPlane` for provisioning) and verify `context.To` matches the current facility.
2. **Idempotency**: Do not assume single delivery. Handlers are executed at-least-once. Use unique IDs (`RequisitionId`, `PrescriptionId`).
3. **Explicit Query Scope**: Handlers run without HTTP context. Tenant/facility EF query filters are bypassed. Always filter explicitly by `context.To.TenantId` and `context.To.FacilityId`.
4. **Preserve Correlation ID**: When sending a reply or follow-up event, pass `correlationId: context.CorrelationId` to preserve correlation routing.
5. **Exception Handling**: Throwing an exception triggers a `nack` with exponential backoff retry. Drop (log and return successfully) unrecoverable invalid payloads to avoid infinite dead-letter loops.

```csharp
public class LabOrderIssuedHandler : IInteropHandler<LabRequisitionIssuedEvent>
{
    private readonly ApplicationDbContext _dbContext;

    public LabOrderIssuedHandler(ApplicationDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task HandleAsync(LabRequisitionIssuedEvent message, InteropContext context, CancellationToken ct)
    {
        // 1. Authorization check
        if (context.To.FacilityId != message.TargetFacilityId)
            return; // Drop if not addressed to us

        // 2. Check idempotency
        var existing = await _dbContext.LabOrders
            .FirstOrDefaultAsync(x => x.RequisitionId == message.RequisitionId, ct);

        if (existing != null)
            return; // Already processed

        // 3. Process business logic
        var newOrder = new LabOrder
        {
            TenantId = context.To.TenantId,
            FacilityId = context.To.FacilityId,
            RequisitionId = message.RequisitionId,
            // ...
        };

        _dbContext.LabOrders.Add(newOrder);
        await _dbContext.SaveChangesAsync(ct);
    }
}
```

---

### 4. Configuring Envelope Signing (ECDSA P-256)

- Every client requires an ECDSA P-256 keypair (`Messaging:SigningKey`).
- Signatures cover MessageId, CorrelationId, Type, Version, From, To/SignedTo, Timestamps, SignerKeyId, and payload SHA-256 (`EnvelopeSigner.cs`).
- In non-Development environments, `Messaging:SigningKey` is mandatory.
- Use `scripts/generate-signing-key.ps1` or `scripts/generate-signing-key.sh` to generate key pairs.

```json
"Messaging": {
  "Transport": "Hub",
  "HubUrl": "https://hub.clinicez.internal",
  "ClientId": "clinic-client-01",
  "ClientSecret": "SECRET_KEY",
  "SigningKey": "PEM_PRIVATE_KEY_HERE",
  "VerifyInbound": true,
  "Service": "clinic"
}
```

---

## Technical Specifications & Deep Dives

For exhaustive details on message signatures, platform services (`philhealth-proxy`), cross-tenant link permissions, claim redemption tokens, and directory synchronization, refer to:

- [Architecture & Envelope Signing Reference](file:///c:/Users/User/projects/nextstep/github/clinicez-arch2/.agents/skills/interop-hub-expert/references/architecture_and_envelope_signing.md)
- [Official Architecture Doc](../../docs/architecture/interop-hub.md)
- [Platform Service Contract](../../docs/architecture/platform-contract.md)

---

## Verification & Troubleshooting Runbook

1. **Check Broker Elimination**:
   Run `powershell -File scripts/check-no-broker.ps1` to confirm no MassTransit/RabbitMQ references exist.

2. **Verify Interop Test Suite**:
   Run `dotnet test packages/shared-dotnet.Tests/ClinicEz.Shared.Tests.csproj`

3. **Troubleshooting Undelivered Messages**:
   - Check `interop_outbox` table in sending database for unsent or failed rows (`State`, `LastAttemptAtUtc`).
   - Inspect `interop_inbox` table in receiver database for dead-lettered envelopes (`AttemptCount >= 10`).
   - Verify `SigningKey` matches registered public key on Hub (`GET /v1/keys/{clientId}`).
