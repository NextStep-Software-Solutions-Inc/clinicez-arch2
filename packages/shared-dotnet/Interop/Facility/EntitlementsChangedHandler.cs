using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Licensing;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Shared.Interop.Facility;

/// <summary>
/// <c>entitlements.changed</c>: the portal re-minted a facility's license (plan, subscription, pool allocation or renewal).
/// The message is only acted on when it comes from the control plane, is addressed to a facility this service holds, and its
/// token verifies against the authority public key for exactly that tenant and facility. Everything applied comes from the
/// SIGNED payload, never from the unsigned message fields. A license older than the held one is ignored; one identical to
/// the held one is a no-op, so redelivery changes nothing.
/// </summary>
public sealed class EntitlementsChangedHandler : IInteropHandler<EntitlementsChangedEvent>
{
    private readonly IFacilityLicenseStore _store;
    private readonly IFacilityLicenseValidator _validator;
    private readonly ILogger<EntitlementsChangedHandler> _logger;

    public EntitlementsChangedHandler(
        IFacilityLicenseStore store,
        IFacilityLicenseValidator validator,
        ILogger<EntitlementsChangedHandler> logger)
    {
        _store = store;
        _validator = validator;
        _logger = logger;
    }

    public async Task HandleAsync(EntitlementsChangedEvent message, InteropMessageContext context, CancellationToken ct)
    {
        if (context.From.Kind != PartyKind.ControlPlane || context.From.Service != InteropServices.Portal)
        {
            _logger.LogWarning(
                "[Entitlements] Ignoring {MessageId}: sender {Sender} is not the portal.",
                context.MessageId, context.From.Address);
            return;
        }

        var to = context.To;
        if (to.Kind != PartyKind.Facility
            || string.IsNullOrWhiteSpace(message.TenantId)
            || !string.Equals(to.TenantId, message.TenantId, StringComparison.Ordinal)
            || !Guid.TryParse(to.FacilityId, out var addressedFacilityId)
            || message.FacilityId == Guid.Empty
            || addressedFacilityId != message.FacilityId)
        {
            _logger.LogWarning(
                "[Entitlements] Ignoring {MessageId}: addressed to {Recipient}, not to facility {FacilityId} of tenant {TenantId}.",
                context.MessageId, to.Address, message.FacilityId, message.TenantId);
            return;
        }

        var held = await _store.GetAsync(message.TenantId, message.FacilityId, ct);
        if (held is null)
        {
            _logger.LogWarning(
                "[Entitlements] Ignoring {MessageId}: facility {FacilityId} of tenant {TenantId} is not held by this service.",
                context.MessageId, message.FacilityId, message.TenantId);
            return;
        }

        // A renewal after the previous license lapsed is signed but already expired: accept it, the facility's own
        // validation then reports the correct (grace / expired) state. Missing and tampered tokens are never accepted.
        var validation = _validator.Validate(message.LicenseToken, message.FacilityId, message.TenantId);
        if (validation.Payload is null || validation.IsMissing || validation.IsTampered)
        {
            _logger.LogWarning(
                "[Entitlements] Rejecting {MessageId} for facility {FacilityId}: {Reason}",
                context.MessageId, message.FacilityId, validation.ErrorMessage ?? "license could not be verified");
            return;
        }

        var token = message.LicenseToken.Trim();
        var incomingVersion = validation.Payload.EntitlementVersion;

        if (incomingVersion < held.EntitlementVersion)
        {
            _logger.LogInformation(
                "[Entitlements] Ignoring stale license v{Incoming} for facility {FacilityId}; v{Held} is held.",
                incomingVersion, message.FacilityId, held.EntitlementVersion);
            return;
        }

        if (incomingVersion == held.EntitlementVersion && string.Equals(held.LicenseToken, token, StringComparison.Ordinal))
        {
            return;
        }

        await _store.SaveAsync(message.TenantId, message.FacilityId, new FacilityLicenseUpdate(token, validation.Payload), ct);

        _logger.LogInformation(
            "[Entitlements] Facility {FacilityId} now holds license v{Version} (plan {Plan}, expires {ExpiresAt:u}).",
            message.FacilityId, incomingVersion, validation.Payload.PlanTier, validation.Payload.ExpiresAtUtc);
    }
}
