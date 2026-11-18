using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Infrastructure.Interop;

/// <summary>
/// Handles <c>practitioner.identity.updated</c> from <see cref="Party.Portal"/>:
/// upserts canonical <see cref="Practitioner"/> state (including merge redirects) and links/syncs
/// <see cref="ClinicHealthcareProvider"/> clinic affiliations and availability schedules.
/// </summary>
public sealed class PractitionerIdentityUpdatedInteropHandler : IInteropHandler<PractitionerIdentityUpdatedPayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ILogger<PractitionerIdentityUpdatedInteropHandler> _logger;

    public PractitionerIdentityUpdatedInteropHandler(
        ApplicationDbContext dbContext,
        ILogger<PractitionerIdentityUpdatedInteropHandler> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task HandleAsync(
        PractitionerIdentityUpdatedPayload message,
        InteropMessageContext context,
        CancellationToken ct)
    {
        var isAuthorizedPortal = context.From.Kind == PartyKind.ControlPlane &&
                                 string.Equals(InteropServices.For(context.From), InteropServices.Portal, StringComparison.OrdinalIgnoreCase);

        if (!isAuthorizedPortal)
        {
            _logger.LogWarning(
                "Ignoring practitioner.identity.updated {MessageId}: sender {Sender} is not the portal.",
                context.MessageId, context.From.Address);
            return;
        }

        var utcNow = DateTime.UtcNow;
        var professionKind = PractitionerIdentity.NormalizeProfessionKind(message.ProfessionKind) ?? "Doctor";
        var normalizedPrc = PractitionerIdentity.NormalizePrc(message.NormalizedPrcLicenseNo)
            ?? message.NormalizedPrcLicenseNo.Trim().ToUpperInvariant();
        var displayPrc = string.IsNullOrWhiteSpace(message.DisplayPrcLicenseNo)
            ? normalizedPrc
            : message.DisplayPrcLicenseNo.Trim();
        var fullName = BuildDisplayName(message.Title, message.FirstName, message.LastName, displayPrc);

        var canonicalId = message.MergedIntoPractitionerId is { } mergedTargetId && mergedTargetId != Guid.Empty
            ? mergedTargetId
            : message.PractitionerId;

        var supersededIds = new HashSet<Guid>();
        if (canonicalId != message.PractitionerId && message.PractitionerId != Guid.Empty)
        {
            supersededIds.Add(message.PractitionerId);
            var sourcePractitioner = await _dbContext.Practitioners
                .FirstOrDefaultAsync(p => p.Id == message.PractitionerId, ct);

            if (sourcePractitioner is not null && sourcePractitioner.MergedIntoPractitionerId != canonicalId)
            {
                sourcePractitioner.MergedIntoPractitionerId = canonicalId;
                sourcePractitioner.UpdatedAt = utcNow;
                await _dbContext.SaveChangesAsync(ct);
            }
        }

        // Guard against a pre-existing unmerged row sharing the same (ProfessionKind, NormalizedPrcLicenseNo)
        var conflictingActive = await _dbContext.Practitioners
            .FirstOrDefaultAsync(
                p => p.Id != canonicalId &&
                     p.ProfessionKind == professionKind &&
                     p.NormalizedPrcLicenseNo == normalizedPrc &&
                     p.MergedIntoPractitionerId == null,
                ct);

        if (conflictingActive is not null)
        {
            supersededIds.Add(conflictingActive.Id);
            conflictingActive.MergedIntoPractitionerId = canonicalId;
            conflictingActive.UpdatedAt = utcNow;
            await _dbContext.SaveChangesAsync(ct);
        }

        var canonicalPractitioner = await _dbContext.Practitioners
            .FirstOrDefaultAsync(p => p.Id == canonicalId, ct);

        if (canonicalPractitioner is null)
        {
            canonicalPractitioner = new Practitioner
            {
                Id = canonicalId,
                MergedIntoPractitionerId = null,
                ProfessionKind = professionKind,
                NormalizedPrcLicenseNo = normalizedPrc,
                DisplayPrcLicenseNo = displayPrc,
                PrcExpiryDate = message.PrcExpiryDate,
                VerificationLevel = message.VerificationLevel,
                Name = fullName,
                FirstName = message.FirstName.Trim(),
                LastName = message.LastName.Trim(),
                PrimarySpecialty = message.PrimarySpecialty.Trim(),
                Bio = message.PublicBio,
                AvatarUrl = message.AvatarUrl,
                VerifiedAtUtc = message.VerifiedAtUtc,
                CreatedAt = utcNow,
                UpdatedAt = utcNow
            };
            await _dbContext.Practitioners.AddAsync(canonicalPractitioner, ct);
            await _dbContext.SaveChangesAsync(ct);
        }
        else
        {
            canonicalPractitioner.MergedIntoPractitionerId = null;
            canonicalPractitioner.ProfessionKind = professionKind;
            canonicalPractitioner.NormalizedPrcLicenseNo = normalizedPrc;
            canonicalPractitioner.DisplayPrcLicenseNo = displayPrc;
            canonicalPractitioner.PrcExpiryDate = message.PrcExpiryDate;
            canonicalPractitioner.VerificationLevel = message.VerificationLevel;
            canonicalPractitioner.Name = fullName;
            canonicalPractitioner.FirstName = message.FirstName.Trim();
            canonicalPractitioner.LastName = message.LastName.Trim();
            canonicalPractitioner.PrimarySpecialty = string.IsNullOrWhiteSpace(message.PrimarySpecialty)
                ? canonicalPractitioner.PrimarySpecialty
                : message.PrimarySpecialty.Trim();
            canonicalPractitioner.Bio = message.PublicBio ?? canonicalPractitioner.Bio;
            canonicalPractitioner.AvatarUrl = message.AvatarUrl ?? canonicalPractitioner.AvatarUrl;
            canonicalPractitioner.VerifiedAtUtc = message.VerifiedAtUtc ?? canonicalPractitioner.VerifiedAtUtc;
            canonicalPractitioner.UpdatedAt = utcNow;
        }

        var trackedIds = new HashSet<Guid>(supersededIds) { canonicalId };

        var linkedProviders = await _dbContext.ClinicHealthcareProviders
            .Include(p => p.ProviderAvailabilities)
            .Where(p => p.PractitionerId != null && trackedIds.Contains(p.PractitionerId.Value))
            .ToListAsync(ct);

        ClinicHealthcareProvider? targetedAffiliation = null;
        var hasAffiliationTarget = message.FacilityId.HasValue || message.ClinicStaffMemberId.HasValue;

        if (hasAffiliationTarget)
        {
            if (message.ClinicStaffMemberId is { } staffId && staffId != Guid.Empty)
            {
                targetedAffiliation = linkedProviders.FirstOrDefault(p => p.Id == staffId)
                    ?? await _dbContext.ClinicHealthcareProviders
                        .Include(p => p.ProviderAvailabilities)
                        .FirstOrDefaultAsync(p => p.Id == staffId, ct);
            }

            if (targetedAffiliation is null && message.FacilityId is { } facilityId && facilityId != Guid.Empty)
            {
                targetedAffiliation = linkedProviders.FirstOrDefault(p => p.ClinicId == facilityId)
                    ?? await _dbContext.ClinicHealthcareProviders
                        .Include(p => p.ProviderAvailabilities)
                        .FirstOrDefaultAsync(
                            p => p.ClinicId == facilityId &&
                                 ((p.PractitionerId != null && trackedIds.Contains(p.PractitionerId.Value)) ||
                                  (normalizedPrc.Length > 0 && p.NormalizedLicenseNo == normalizedPrc && p.Role == professionKind)),
                            ct);
            }

            if (targetedAffiliation is not null)
            {
                ApplyAffiliationUpdate(targetedAffiliation, canonicalId, professionKind, fullName, displayPrc, normalizedPrc, message, applyLocalFields: true, utcNow);
                await PractitionerAvailabilitySyncHelper.SyncExistingProviderAvailabilitiesAsync(
                    _dbContext, targetedAffiliation, message.Availabilities, ct);
            }
            else if (message.FacilityId is { } targetClinicId &&
                     targetClinicId != Guid.Empty &&
                     await _dbContext.Clinics.AsNoTracking().AnyAsync(c => c.Id == targetClinicId, ct))
            {
                var newProviderId = message.ClinicStaffMemberId is { } sid && sid != Guid.Empty
                    ? sid
                    : Guid.NewGuid();
                var resolvedSpecialty = !string.IsNullOrWhiteSpace(message.LocalSpecialty)
                    ? message.LocalSpecialty.Trim()
                    : (!string.IsNullOrWhiteSpace(message.PrimarySpecialty) ? message.PrimarySpecialty.Trim() : "General Practice");

                var createdProvider = new ClinicHealthcareProvider
                {
                    Id = newProviderId,
                    ClinicId = targetClinicId,
                    PractitionerId = canonicalId,
                    Role = professionKind,
                    Name = fullName,
                    Specialty = resolvedSpecialty,
                    AvatarUrl = message.AvatarUrl,
                    ProfessionalLicenseNo = displayPrc,
                    NormalizedLicenseNo = normalizedPrc,
                    IsDirectoryOptIn = true,
                    AffiliationStatus = string.IsNullOrWhiteSpace(message.AffiliationStatus) ? "Active" : message.AffiliationStatus.Trim(),
                    HasIdentityConflict = false,
                    IsActive = true,
                    CreatedAt = utcNow,
                    UpdatedAt = utcNow
                };

                createdProvider.ProviderAvailabilities =
                    PractitionerAvailabilitySyncHelper.BuildNewProviderAvailabilities(createdProvider.Id, message.Availabilities);

                await _dbContext.ClinicHealthcareProviders.AddAsync(createdProvider, ct);
            }
        }

        foreach (var provider in linkedProviders)
        {
            if (targetedAffiliation is not null && provider.Id == targetedAffiliation.Id)
                continue;

            ApplyAffiliationUpdate(
                provider,
                canonicalId,
                professionKind,
                fullName,
                displayPrc,
                normalizedPrc,
                message,
                applyLocalFields: !hasAffiliationTarget,
                utcNow);

            if (!hasAffiliationTarget && message.Availabilities is not null)
            {
                await PractitionerAvailabilitySyncHelper.SyncExistingProviderAvailabilitiesAsync(
                    _dbContext, provider, message.Availabilities, ct);
            }
        }

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation(
            "[ClinicEz.Patient] Upserted canonical practitioner {PractitionerId} ({ProfessionKind}, Level: {VerificationLevel})",
            canonicalId, professionKind, message.VerificationLevel);
    }

    private static void ApplyAffiliationUpdate(
        ClinicHealthcareProvider provider,
        Guid canonicalId,
        string professionKind,
        string fullName,
        string displayPrc,
        string normalizedPrc,
        PractitionerIdentityUpdatedPayload message,
        bool applyLocalFields,
        DateTime utcNow)
    {
        provider.PractitionerId = canonicalId;
        provider.Role = professionKind;
        provider.Name = fullName;
        provider.ProfessionalLicenseNo = displayPrc;
        provider.NormalizedLicenseNo = normalizedPrc;
        provider.AvatarUrl = message.AvatarUrl ?? provider.AvatarUrl;
        provider.HasIdentityConflict = false;
        provider.UpdatedAt = utcNow;

        if (applyLocalFields)
        {
            if (!string.IsNullOrWhiteSpace(message.AffiliationStatus))
                provider.AffiliationStatus = message.AffiliationStatus.Trim();

            if (!string.IsNullOrWhiteSpace(message.LocalSpecialty))
                provider.Specialty = message.LocalSpecialty.Trim();
            else if (!string.IsNullOrWhiteSpace(message.PrimarySpecialty))
                provider.Specialty = message.PrimarySpecialty.Trim();
        }
        else if (string.IsNullOrWhiteSpace(provider.Specialty) && !string.IsNullOrWhiteSpace(message.PrimarySpecialty))
        {
            provider.Specialty = message.PrimarySpecialty.Trim();
        }
    }

    private static string BuildDisplayName(string? title, string firstName, string lastName, string fallback)
    {
        var parts = new[] { title, firstName, lastName }
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s!.Trim())
            .ToArray();

        return parts.Length > 0 ? string.Join(" ", parts) : fallback;
    }
}
