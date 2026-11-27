using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Application.Features.DirectoryVerification;

public sealed record PractitionerRequestSnapshot(
    Guid RequestId,
    Guid FacilityId,
    string FacilityName,
    Guid ClinicStaffMemberId,
    string RequestKind,
    string ProfessionKind,
    string FirstName,
    string LastName,
    string? Title,
    string SubmittedPrcLicenseNo,
    string NormalizedPrcLicenseNo,
    DateOnly? PrcExpiryDate,
    string? PrcEvidenceObjectKey,
    string? VerificationContact,
    string? Specialty,
    string? PublicBio,
    string? AvatarUrl,
    IReadOnlyList<ProviderAvailabilityWindowDto> Availabilities,
    string? SubmittedByClinicUserId,
    DateTime SubmittedAtUtc,
    bool HasNameMismatch = false,
    Guid? MatchedPractitionerId = null,
    string? MatchedPractitionerName = null,
    string? OtpCodeHash = null,
    string? SubmittedByDisplayName = null);

public static class DirectoryVerificationHelper
{
    public const string AuditSection = "directory-verification";
    public const int AffiliationOtpTtlHours = 72;

    private static readonly JsonSerializerOptions SnapshotPreserveNullKeyOptions = new(InteropJson.Options)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.Never
    };

    public static string SerializeFacilitySnapshot(FacilityVerificationRequestedPayload snapshot)
    {
        var node = JsonSerializer.SerializeToNode(snapshot, InteropJson.Options);
        if (node is JsonObject obj)
        {
            if (!obj.ContainsKey("dohLtoExpiryDate"))
                obj["dohLtoExpiryDate"] = null;
            if (!obj.ContainsKey("philHealthAccreditationNumber"))
                obj["philHealthAccreditationNumber"] = null;
            if (!obj.ContainsKey("contactNumber"))
                obj["contactNumber"] = null;
        }

        return node?.ToJsonString(SnapshotPreserveNullKeyOptions)
            ?? JsonSerializer.Serialize(snapshot, InteropJson.Options);
    }

    public static string HashSecret(string raw)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(raw.Trim()));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    public static string GenerateOtpCode() =>
        RandomNumberGenerator.GetInt32(100000, 1000000).ToString();

    public static bool IsPureEmailAddress(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        var trimmed = value.Trim();
        if (trimmed.Any(char.IsWhiteSpace))
            return false;

        var atIndex = trimmed.IndexOf('@');
        if (atIndex <= 0 || atIndex == trimmed.Length - 1)
            return false;

        if (!trimmed[(atIndex + 1)..].Contains('.'))
            return false;

        return MailAddress.TryCreate(trimmed, out var parsed)
            && string.Equals(parsed.Address, trimmed, StringComparison.OrdinalIgnoreCase);
    }

    public static (string? ContactNumber, string? ContactEmail) NormalizeFacilityContacts(
        string? rawContactNumber,
        string? rawContactEmail)
    {
        var cleanPhone = string.IsNullOrWhiteSpace(rawContactNumber) ? null : rawContactNumber.Trim();
        var cleanEmail = string.IsNullOrWhiteSpace(rawContactEmail) ? null : rawContactEmail.Trim();

        if (IsPureEmailAddress(cleanPhone))
        {
            return (null, cleanEmail ?? cleanPhone);
        }

        return (cleanPhone, cleanEmail);
    }

    public static string NormalizeProfessionOrFallback(string? professionKind) =>
        PractitionerIdentity.NormalizeProfessionKind(professionKind)
        ?? (string.IsNullOrWhiteSpace(professionKind) ? "Doctor" : professionKind.Trim());

    public static string NormalizePrcOrFallback(string? normalizedPrc, string? submittedPrc) =>
        PractitionerIdentity.NormalizePrc(normalizedPrc)
        ?? PractitionerIdentity.NormalizePrc(submittedPrc)
        ?? (submittedPrc ?? string.Empty).Trim().ToUpperInvariant();

    public static string SerializeAvailabilities(IReadOnlyList<ProviderAvailabilityWindowDto>? availabilities) =>
        JsonSerializer.Serialize(availabilities ?? Array.Empty<ProviderAvailabilityWindowDto>(), InteropJson.Options);

    public static IReadOnlyList<ProviderAvailabilityWindowDto> DeserializeAvailabilities(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return Array.Empty<ProviderAvailabilityWindowDto>();

        try
        {
            return JsonSerializer.Deserialize<List<ProviderAvailabilityWindowDto>>(json, InteropJson.Options)
                   ?? (IReadOnlyList<ProviderAvailabilityWindowDto>)Array.Empty<ProviderAvailabilityWindowDto>();
        }
        catch
        {
            return Array.Empty<ProviderAvailabilityWindowDto>();
        }
    }

    public static FacilityVerificationRequestedPayload? DeserializeFacilitySnapshot(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return null;

        try
        {
            return JsonSerializer.Deserialize<FacilityVerificationRequestedPayload>(json, InteropJson.Options);
        }
        catch
        {
            return null;
        }
    }

    public static PractitionerRequestSnapshot? DeserializePractitionerSnapshot(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return null;

        try
        {
            return JsonSerializer.Deserialize<PractitionerRequestSnapshot>(json, InteropJson.Options);
        }
        catch
        {
            return null;
        }
    }

    public static string FormatDisplayName(string? title, string firstName, string lastName)
    {
        var parts = new[] { title, firstName, lastName }
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s!.Trim());
        return string.Join(" ", parts);
    }

    public static void StageAuditEntry(
        IApplicationDbContext db,
        Guid tenantId,
        string actorUserId,
        string actorName,
        string actorRole,
        string action,
        object changes)
    {
        var safeActorId = string.IsNullOrWhiteSpace(actorUserId) ? "system" : actorUserId.Trim();
        var safeActorName = string.IsNullOrWhiteSpace(actorName) ? "System" : actorName.Trim();
        var safeRole = string.IsNullOrWhiteSpace(actorRole) ? "System" : actorRole.Trim();

        db.WorkspaceAuditEntries.Add(new WorkspaceAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ActorUserId = safeActorId[..Math.Min(safeActorId.Length, 128)],
            ActorName = safeActorName[..Math.Min(safeActorName.Length, 256)],
            ActorRole = safeRole[..Math.Min(safeRole.Length, 32)],
            Section = AuditSection,
            Action = action[..Math.Min(action.Length, 32)],
            ChangesJson = JsonSerializer.Serialize(changes, InteropJson.Options)
        });
    }

    public static async Task<(Practitioner Practitioner, PractitionerAffiliation Affiliation)> UpsertVerifiedPractitionerAndAffiliationAsync(
        IApplicationDbContext db,
        PractitionerVerificationRequest request,
        PractitionerRequestSnapshot? snapshot,
        string adminUserId,
        DateTime now,
        bool confirmedViaOtp,
        CancellationToken ct)
    {
        var professionKind = NormalizeProfessionOrFallback(request.ProfessionKind);
        var normalizedPrc = NormalizePrcOrFallback(request.NormalizedPrcLicenseNo, request.SubmittedPrcLicenseNo);

        var firstName = snapshot?.FirstName?.Trim() ?? string.Empty;
        var lastName = snapshot?.LastName?.Trim() ?? string.Empty;
        var title = string.IsNullOrWhiteSpace(snapshot?.Title) ? null : snapshot.Title.Trim();
        var specialty = !string.IsNullOrWhiteSpace(snapshot?.Specialty)
            ? snapshot.Specialty.Trim()
            : professionKind;
        var publicBio = string.IsNullOrWhiteSpace(snapshot?.PublicBio) ? null : snapshot.PublicBio.Trim();
        var avatarUrl = string.IsNullOrWhiteSpace(snapshot?.AvatarUrl) ? null : snapshot.AvatarUrl.Trim();
        var availabilities = snapshot?.Availabilities ?? Array.Empty<ProviderAvailabilityWindowDto>();
        var availabilitiesJson = SerializeAvailabilities(availabilities);
        var localDisplayName = FormatDisplayName(title, firstName, lastName);

        var practitioner = db.Practitioners.Local.FirstOrDefault(p =>
                p.MergedIntoPractitionerId == null
                && !p.IsDeleted
                && p.ProfessionKind == professionKind
                && p.NormalizedPrcLicenseNo == normalizedPrc)
            ?? await db.Practitioners.FirstOrDefaultAsync(p =>
                p.MergedIntoPractitionerId == null
                && !p.IsDeleted
                && p.ProfessionKind == professionKind
                && p.NormalizedPrcLicenseNo == normalizedPrc, ct);

        if (practitioner is null)
        {
            practitioner = new Practitioner
            {
                Id = Guid.NewGuid(),
                ProfessionKind = professionKind,
                NormalizedPrcLicenseNo = normalizedPrc,
                DisplayPrcLicenseNo = string.IsNullOrWhiteSpace(request.SubmittedPrcLicenseNo) ? normalizedPrc : request.SubmittedPrcLicenseNo.Trim(),
                PrcExpiryDate = request.PrcExpiryDate ?? snapshot?.PrcExpiryDate,
                FirstName = firstName,
                LastName = lastName,
                Title = title,
                PrimarySpecialty = specialty,
                PublicBio = publicBio,
                AvatarUrl = avatarUrl,
                VerificationContact = request.VerificationContact,
                VerificationStatus = PractitionerVerificationLevel.Verified,
                LatestVerificationRequestId = request.Id,
                VerifiedAtUtc = now,
                VerifiedByAdminUserId = adminUserId
            };
            db.Practitioners.Add(practitioner);
        }
        else
        {
            var wasAlreadyVerified = practitioner.VerificationStatus == PractitionerVerificationLevel.Verified;
            practitioner.VerificationStatus = PractitionerVerificationLevel.Verified;
            practitioner.DisplayPrcLicenseNo = string.IsNullOrWhiteSpace(request.SubmittedPrcLicenseNo)
                ? practitioner.DisplayPrcLicenseNo
                : request.SubmittedPrcLicenseNo.Trim();

            if (request.PrcExpiryDate.HasValue)
                practitioner.PrcExpiryDate = request.PrcExpiryDate;
            else if (snapshot?.PrcExpiryDate is not null)
                practitioner.PrcExpiryDate = snapshot.PrcExpiryDate;

            if (!wasAlreadyVerified)
            {
                if (!string.IsNullOrWhiteSpace(firstName)) practitioner.FirstName = firstName;
                if (!string.IsNullOrWhiteSpace(lastName)) practitioner.LastName = lastName;
                if (title is not null) practitioner.Title = title;
                if (!string.IsNullOrWhiteSpace(specialty)) practitioner.PrimarySpecialty = specialty;
                if (publicBio is not null) practitioner.PublicBio = publicBio;
                if (avatarUrl is not null) practitioner.AvatarUrl = avatarUrl;
            }
            else
            {
                if (string.IsNullOrWhiteSpace(practitioner.PrimarySpecialty) && !string.IsNullOrWhiteSpace(specialty))
                    practitioner.PrimarySpecialty = specialty;
                if (string.IsNullOrWhiteSpace(practitioner.PublicBio) && publicBio is not null)
                    practitioner.PublicBio = publicBio;
                if (string.IsNullOrWhiteSpace(practitioner.AvatarUrl) && avatarUrl is not null)
                    practitioner.AvatarUrl = avatarUrl;
            }

            if (!string.IsNullOrWhiteSpace(request.VerificationContact) && string.IsNullOrWhiteSpace(practitioner.VerificationContact))
                practitioner.VerificationContact = request.VerificationContact.Trim();

            practitioner.LatestVerificationRequestId = request.Id;
            practitioner.VerifiedAtUtc ??= now;
            if (!string.IsNullOrWhiteSpace(adminUserId))
                practitioner.VerifiedByAdminUserId = adminUserId;
        }

        var affiliation = db.PractitionerAffiliations.Local.FirstOrDefault(a =>
                !a.IsDeleted
                && a.FacilityId == request.FacilityId
                && a.ClinicStaffMemberId == request.ClinicStaffMemberId)
            ?? await db.PractitionerAffiliations.FirstOrDefaultAsync(a =>
                !a.IsDeleted
                && a.FacilityId == request.FacilityId
                && a.ClinicStaffMemberId == request.ClinicStaffMemberId, ct);

        if (affiliation is null)
        {
            affiliation = new PractitionerAffiliation
            {
                Id = Guid.NewGuid(),
                PractitionerId = practitioner.Id,
                FacilityId = request.FacilityId,
                TenantId = request.TenantId,
                ClinicStaffMemberId = request.ClinicStaffMemberId,
                Role = professionKind,
                LocalDisplayName = string.IsNullOrWhiteSpace(localDisplayName) ? null : localDisplayName,
                LocalSpecialty = specialty,
                AvailabilitiesJson = availabilitiesJson,
                AffiliationStatus = "Active",
                OptedInAtUtc = request.SubmittedAtUtc == default ? now : request.SubmittedAtUtc,
                ConfirmedViaOtpAtUtc = confirmedViaOtp ? now : null
            };
            db.PractitionerAffiliations.Add(affiliation);
        }
        else
        {
            affiliation.PractitionerId = practitioner.Id;
            affiliation.Role = professionKind;
            affiliation.LocalDisplayName = string.IsNullOrWhiteSpace(localDisplayName) ? affiliation.LocalDisplayName : localDisplayName;
            affiliation.LocalSpecialty = specialty;
            affiliation.AvailabilitiesJson = availabilitiesJson;
            affiliation.AffiliationStatus = "Active";
            affiliation.WithdrawnAtUtc = null;
            if (confirmedViaOtp)
                affiliation.ConfirmedViaOtpAtUtc = now;
        }

        request.PractitionerId = practitioner.Id;
        request.AffiliationId = affiliation.Id;

        return (practitioner, affiliation);
    }

    public static void StagePractitionerIdentityUpdated(
        IInteropPublisher publisher,
        Practitioner practitioner,
        PractitionerAffiliation affiliation,
        Facility facility,
        Guid correlationId)
    {
        var availabilities = DeserializeAvailabilities(affiliation.AvailabilitiesJson);
        var payload = new PractitionerIdentityUpdatedPayload
        {
            PractitionerId = practitioner.Id,
            MergedIntoPractitionerId = practitioner.MergedIntoPractitionerId,
            ProfessionKind = practitioner.ProfessionKind,
            NormalizedPrcLicenseNo = practitioner.NormalizedPrcLicenseNo,
            DisplayPrcLicenseNo = practitioner.DisplayPrcLicenseNo,
            PrcExpiryDate = practitioner.PrcExpiryDate,
            VerificationLevel = practitioner.VerificationStatus,
            FirstName = practitioner.FirstName,
            LastName = practitioner.LastName,
            Title = practitioner.Title,
            PrimarySpecialty = practitioner.PrimarySpecialty,
            PublicBio = practitioner.PublicBio,
            AvatarUrl = practitioner.AvatarUrl,
            VerifiedAtUtc = practitioner.VerifiedAtUtc,
            TenantId = affiliation.TenantId.ToString(),
            FacilityId = affiliation.FacilityId,
            ClinicStaffMemberId = affiliation.ClinicStaffMemberId,
            AffiliationStatus = affiliation.AffiliationStatus,
            LocalSpecialty = affiliation.LocalSpecialty,
            Availabilities = availabilities
        };

        publisher.Enqueue(
            InteropTypes.PractitionerIdentityUpdated,
            Party.Portal,
            new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient },
            correlationId,
            payload);

        if (!facility.IsDeleted && facility.Status is FacilityStatus.Provisioning or FacilityStatus.Active)
        {
            publisher.Enqueue(
                InteropTypes.PractitionerIdentityUpdated,
                Party.Portal,
                Party.ForFacility(affiliation.TenantId.ToString(), affiliation.FacilityId.ToString(), facility.FacilityType),
                correlationId,
                payload);
        }
    }

    public static void StagePractitionerRevokedForAll(
        IInteropPublisher publisher,
        Practitioner practitioner,
        IEnumerable<(PractitionerAffiliation Affiliation, Facility? Facility)> affiliations,
        PractitionerVerificationLevel newStatus,
        string reason,
        DateTime revokedAtUtc,
        Guid correlationId)
    {
        var patientPayload = new PractitionerVerificationRevokedPayload
        {
            PractitionerId = practitioner.Id,
            ProfessionKind = practitioner.ProfessionKind,
            NormalizedPrcLicenseNo = practitioner.NormalizedPrcLicenseNo,
            NewStatus = newStatus,
            Reason = reason,
            RevokedAtUtc = revokedAtUtc
        };

        publisher.Enqueue(
            InteropTypes.PractitionerVerificationRevoked,
            Party.Portal,
            new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient },
            correlationId,
            patientPayload);

        foreach (var (affiliation, facility) in affiliations)
        {
            if (facility is null || facility.IsDeleted || facility.Status is FacilityStatus.Suspended or FacilityStatus.Failed)
                continue;

            var facilityPayload = patientPayload with
            {
                TenantId = affiliation.TenantId.ToString(),
                FacilityId = affiliation.FacilityId,
                ClinicStaffMemberId = affiliation.ClinicStaffMemberId
            };

            publisher.Enqueue(
                InteropTypes.PractitionerVerificationRevoked,
                Party.Portal,
                Party.ForFacility(affiliation.TenantId.ToString(), affiliation.FacilityId.ToString(), facility.FacilityType),
                correlationId,
                facilityPayload);
        }
    }

    public static void StageFacilityPractitionerStatusUpdate(
        IInteropPublisher? publisher,
        Facility facility,
        Guid tenantId,
        Guid clinicStaffMemberId,
        Guid? matchedPractitionerId,
        string professionKind,
        string normalizedPrcLicenseNo,
        string displayPrcLicenseNo,
        DateOnly? prcExpiryDate,
        PractitionerVerificationLevel verificationLevel,
        string affiliationStatus,
        Guid correlationId)
    {
        if (publisher is null || facility.IsDeleted || facility.Status is not (FacilityStatus.Provisioning or FacilityStatus.Active))
            return;

        var payload = new PractitionerIdentityUpdatedPayload
        {
            PractitionerId = matchedPractitionerId ?? Guid.Empty,
            ProfessionKind = professionKind,
            NormalizedPrcLicenseNo = normalizedPrcLicenseNo,
            DisplayPrcLicenseNo = string.IsNullOrWhiteSpace(displayPrcLicenseNo) ? normalizedPrcLicenseNo : displayPrcLicenseNo.Trim(),
            PrcExpiryDate = prcExpiryDate,
            VerificationLevel = verificationLevel,
            TenantId = tenantId.ToString(),
            FacilityId = facility.Id,
            ClinicStaffMemberId = clinicStaffMemberId,
            AffiliationStatus = affiliationStatus
        };

        publisher.Enqueue(
            InteropTypes.PractitionerIdentityUpdated,
            Party.Portal,
            Party.ForFacility(tenantId.ToString(), facility.Id.ToString(), facility.FacilityType),
            correlationId,
            payload);
    }

    public static void TryEnqueueAffiliationConfirmationEmail(
        INotificationService? notifications,
        IFrontendUrlProvider? frontendUrlProvider,
        string? contact,
        string practitionerName,
        string facilityName,
        string professionKind,
        string rawToken,
        string otpCode,
        Guid correlationId,
        ILogger? logger = null)
    {
        if (notifications is null)
        {
            logger?.LogWarning(
                "Skipped affiliation confirmation email for request {CorrelationId} ({PractitionerName} at {FacilityName}): INotificationService is not configured.",
                correlationId, practitionerName, facilityName);
            return;
        }

        if (string.IsNullOrWhiteSpace(contact))
        {
            logger?.LogWarning(
                "Skipped affiliation confirmation email for request {CorrelationId} ({PractitionerName} at {FacilityName}): VerificationContact is empty.",
                correlationId, practitionerName, facilityName);
            return;
        }

        var trimmedContact = contact.Trim();
        if (!MailAddress.TryCreate(trimmedContact, out var parsed) || !string.Equals(parsed.Address, trimmedContact, StringComparison.OrdinalIgnoreCase))
        {
            logger?.LogWarning(
                "Skipped affiliation confirmation email for request {CorrelationId} ({PractitionerName} at {FacilityName}): VerificationContact '{Contact}' is not a valid email address.",
                correlationId, practitionerName, facilityName, trimmedContact);
            return;
        }

        var baseUrl = frontendUrlProvider?.GetBaseUrl();
        if (string.IsNullOrWhiteSpace(baseUrl) || !Uri.TryCreate(baseUrl, UriKind.Absolute, out _))
        {
            baseUrl = "https://portal.clinicez.ph";
        }

        var confirmUrl = $"{baseUrl.TrimEnd('/')}/verify/practitioner?token={Uri.EscapeDataString(rawToken)}";

        var jobId = notifications.EnqueueEmail(new NotificationEmailRequestedPayload
        {
            To = trimmedContact,
            Subject = $"Confirm your clinic affiliation with {facilityName}",
            TemplateKey = EmailTemplateKeys.PractitionerAffiliationConfirmation,
            Model = new Dictionary<string, string>
            {
                ["practitionerName"] = practitionerName,
                ["facilityName"] = facilityName,
                ["professionKind"] = professionKind,
                ["confirmUrl"] = confirmUrl,
                ["otpCode"] = otpCode
            }
        }, correlationId);

        logger?.LogInformation(
            "Enqueued affiliation confirmation email job {JobId} for request {CorrelationId} to {To} ({PractitionerName} at {FacilityName}).",
            jobId, correlationId, trimmedContact, practitionerName, facilityName);
    }
}
