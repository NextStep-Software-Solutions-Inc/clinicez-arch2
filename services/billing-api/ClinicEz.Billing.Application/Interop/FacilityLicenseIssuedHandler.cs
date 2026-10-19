using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Licensing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Billing.Application.Interop;

/// <summary>
/// <c>facility.license.issued</c> at the billing mailbox of a facility: the control plane hands billing the signed license of a
/// facility whose counter works here. Billing keeps the token on that facility's <see cref="BillingFacility"/> row and from then on
/// enforces it (see <c>ReadOnlyGraceMiddleware</c>); later replacements arrive as <c>entitlements.changed</c>.
/// <list type="bullet">
/// <item>Only the control plane may send it, addressed to the billing mailbox of exactly that facility and tenant.</item>
/// <item>The token must verify against the authority key and be bound to that facility and tenant. An expired but genuine token is
/// kept (the facility is then read-only or blocked, as the license says); a forged one is dropped.</item>
/// <item>A license older than the one held is ignored; a redelivery of the same one changes nothing. Billing does not acknowledge
/// with <c>facility.provisioned</c>: the facility's own service does.</item>
/// </list>
/// </summary>
public sealed class FacilityLicenseIssuedHandler : IInteropHandler<FacilityCreatedEvent>
{
    private readonly IBillingDbContext _db;
    private readonly IFacilityLicenseValidator _validator;
    private readonly TimeProvider _clock;
    private readonly ILogger<FacilityLicenseIssuedHandler> _logger;

    public FacilityLicenseIssuedHandler(IBillingDbContext db, IFacilityLicenseValidator validator, TimeProvider clock, ILogger<FacilityLicenseIssuedHandler> logger)
    {
        _db = db;
        _validator = validator;
        _clock = clock;
        _logger = logger;
    }

    public async Task HandleAsync(FacilityCreatedEvent message, InteropMessageContext context, CancellationToken ct)
    {
        if (context.From.Kind != PartyKind.ControlPlane)
        {
            _logger.LogWarning("[Billing] Ignoring {Type} {MessageId}: only the control plane issues licenses (sender {Sender}).", context.Type, context.MessageId, context.From.Address);
            return;
        }

        if (!IsBillingMailboxOf(context.To, message))
        {
            _logger.LogWarning(
                "[Billing] Ignoring {Type} {MessageId}: {Recipient} is not the billing mailbox of facility {FacilityId} of tenant {TenantId}.",
                context.Type, context.MessageId, context.To.Address, message.ResourceId, message.TenantId);
            return;
        }

        if (string.IsNullOrWhiteSpace(message.LicenseToken))
        {
            _logger.LogInformation("[Billing] {Type} {MessageId} for facility {FacilityId} carries no license token; nothing to keep.", context.Type, context.MessageId, message.ResourceId);
            return;
        }

        var checkedLicense = _validator.Validate(message.LicenseToken, message.ResourceId, message.TenantId);
        if (checkedLicense.Payload is not { } license)
        {
            _logger.LogWarning(
                "[Billing] Ignoring {Type} {MessageId}: the license for facility {FacilityId} failed verification ({Reason}).",
                context.Type, context.MessageId, message.ResourceId, checkedLicense.ErrorMessage);
            return;
        }

        var facilityId = message.ResourceId.ToString();
        var now = _clock.GetUtcNow().UtcDateTime;
        var facility = await _db.BillingFacilities.IgnoreQueryFilters()
            .FirstOrDefaultAsync(f => f.TenantId == message.TenantId && f.FacilityId.ToLower() == facilityId, ct);

        if (facility is null)
        {
            facility = new BillingFacility { Id = Guid.NewGuid(), TenantId = message.TenantId, FacilityId = facilityId, FirstSeenUtc = now };
            _db.BillingFacilities.Add(facility);
        }
        else if (facility.LicenseToken is not null && license.EntitlementVersion < facility.EntitlementVersion)
        {
            _logger.LogInformation(
                "[Billing] Ignoring {Type} {MessageId}: license version {Version} of facility {FacilityId} is older than the held version {Held}.",
                context.Type, context.MessageId, license.EntitlementVersion, message.ResourceId, facility.EntitlementVersion);
            return;
        }

        facility.FacilityType = message.FacilityType;
        facility.LastSeenUtc = now;
        facility.LicenseToken = message.LicenseToken;
        facility.EntitlementVersion = license.EntitlementVersion;
        facility.PlanTier = license.PlanTier;
        facility.LicenseExpiresAt = license.ExpiresAtUtc;

        await _db.SaveChangesAsync(ct);
    }

    private static bool IsBillingMailboxOf(Party to, FacilityCreatedEvent message) =>
        to.Kind == PartyKind.Facility
        && string.Equals(to.TenantId, message.TenantId, StringComparison.Ordinal)
        && Guid.TryParse(to.FacilityId, out var facilityId)
        && facilityId == message.ResourceId
        && string.Equals(to.Service, InteropServices.Billing, StringComparison.Ordinal);
}
