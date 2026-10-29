using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging;

/// <summary>
/// Ingests public patient registration requests (<c>patient.join.requested</c>) into the addressed clinic facility.
/// Resolves target clinic jurisdiction via <see cref="ClinicRecipientResolver"/> (using <c>IgnoreQueryFilters()</c>),
/// validates clinic join toggle, verifies join code and expiration, assigns sequential <c>PAT-{yyyy}-{seq:D5}</c> codes,
/// places patient and attachments into quarantine (<c>PendingVerification</c>), maps PhilHealth Member Type credentials
/// into <c>CustomFields["philhealth_profile"]</c>, persists structured allergies, and allocates daily queue tickets (<c>Q-{seq:D3}</c>).
/// </summary>
public sealed class PatientJoinRequestedHandler : IInteropHandler<PatientJoinRequestedPayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ClinicRecipientResolver _recipient;
    private readonly IPatientCodeGenerator _codeGenerator;
    private readonly ILogger<PatientJoinRequestedHandler> _logger;

    public PatientJoinRequestedHandler(
        ApplicationDbContext dbContext,
        ClinicRecipientResolver recipient,
        ILogger<PatientJoinRequestedHandler> logger,
        IPatientCodeGenerator? codeGenerator = null)
    {
        _dbContext = dbContext;
        _recipient = recipient;
        _logger = logger;
        _codeGenerator = codeGenerator ?? new PatientCodeGenerator(dbContext);
    }

    public async Task HandleAsync(PatientJoinRequestedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic == null) return;

        // Facility Slug check if message specifies one and clinic has a configured facility slug
        if (!string.IsNullOrWhiteSpace(clinic.FacilitySlug) &&
            !string.IsNullOrWhiteSpace(message.FacilitySlug) &&
            !string.Equals(clinic.FacilitySlug, message.FacilitySlug, StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning(
                "[PatientJoinRequestedHandler] FacilitySlug mismatch for message {MessageId}: addressed {ClinicFacilitySlug} vs requested {RequestedFacilitySlug}",
                context.MessageId, clinic.FacilitySlug, message.FacilitySlug);
            return;
        }

        // Validate clinic join link status
        if (!clinic.IsJoinEnabled)
        {
            _logger.LogWarning(
                "[PatientJoinRequestedHandler] Join link is disabled for clinic {ClinicId}. Dropping message {MessageId}.",
                clinic.ClinicId, context.MessageId);
            return;
        }

        // Validate join code if configured
        if (!string.IsNullOrWhiteSpace(clinic.JoinCode))
        {
            var normalizedProvidedCode = message.JoinCode?.Trim().ToUpperInvariant();
            var normalizedClinicCode = clinic.JoinCode.Trim().ToUpperInvariant();
            if (!string.Equals(normalizedProvidedCode, normalizedClinicCode, StringComparison.Ordinal))
            {
                _logger.LogWarning(
                    "[PatientJoinRequestedHandler] Invalid JoinCode for clinic {ClinicId}. Provided: {ProvidedCode}, Expected: {ExpectedCode}. Dropping message {MessageId}.",
                    clinic.ClinicId, normalizedProvidedCode, normalizedClinicCode, context.MessageId);
                return;
            }
        }

        // Validate join code expiration
        if (clinic.JoinCodeExpiresAt.HasValue && clinic.JoinCodeExpiresAt.Value < DateTime.UtcNow)
        {
            _logger.LogWarning(
                "[PatientJoinRequestedHandler] JoinCode for clinic {ClinicId} expired at {ExpiredAt}. Dropping message {MessageId}.",
                clinic.ClinicId, clinic.JoinCodeExpiresAt.Value, context.MessageId);
            return;
        }

        // Check idempotency: check by CloudPatientId matching correlation ID or JoinRequestId
        var correlationIdStr = context.CorrelationId.ToString();
        var existingPatient = await _dbContext.Patients
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(p =>
                !p.IsDeleted && p.ClinicId == clinic.ClinicId &&
                (p.CloudPatientId == context.CorrelationId ||
                 (message.JoinRequestId.HasValue && (p.Id == message.JoinRequestId.Value || p.CloudPatientId == message.JoinRequestId.Value))),
                ct);

        if (existingPatient != null)
        {
            _logger.LogInformation(
                "[PatientJoinRequestedHandler] Patient join request with correlation ID {CorrelationId} or join request ID {JoinRequestId} already processed ({PatientId}). Skipping.",
                context.CorrelationId, message.JoinRequestId, existingPatient.Id);
            return;
        }

        // Atomic sequential PatientCode generation: PAT-{yyyy}-{seq:D5}
        var year = DateTime.UtcNow.Year;
        var patientCode = await _codeGenerator.GenerateNextCodeAsync(clinic.TenantId, clinic.ClinicId, year, ct);

        // Patient ID allocation
        var patientId = message.JoinRequestId ?? Guid.NewGuid();
        var idExists = await _dbContext.Patients.IgnoreQueryFilters().AnyAsync(p => p.Id == patientId, ct);
        if (idExists) patientId = Guid.NewGuid();

        var customFields = message.CustomFields != null
            ? new Dictionary<string, object?>(message.CustomFields)
            : new Dictionary<string, object?>();

        customFields["join_tracking_id"] = correlationIdStr;

        if (!string.IsNullOrWhiteSpace(message.Address) && !customFields.ContainsKey("primary_address_line"))
        {
            customFields["primary_address_line"] = message.Address.Trim();
        }

        // Create Patient in quarantine
        var clinicPatient = new Patient
        {
            Id = patientId,
            TenantId = clinic.TenantId,
            ClinicId = clinic.ClinicId,
            CloudPatientId = message.JoinRequestId ?? context.CorrelationId,
            PatientCode = patientCode,
            FirstName = message.FirstName.Trim(),
            LastName = message.LastName.Trim(),
            MiddleName = message.MiddleName?.Trim(),
            Suffix = message.Suffix?.Trim(),
            DateOfBirth = message.DateOfBirth,
            Sex = string.IsNullOrWhiteSpace(message.Sex)
                ? BiologicalSex.Unknown
                : ClinicEz.Clinic.Application.Features.Patients.Commands.RegisterClinicPatientCommandHandler.ParseBiologicalSex(message.Sex),
            CivilStatus = Enum.TryParse<CivilStatus>(message.CivilStatus, true, out var cs) ? cs : null,
            ContactNumber = !string.IsNullOrWhiteSpace(message.ContactNumber) ? message.ContactNumber.Trim() : "N/A",
            Email = message.Email?.Trim(),
            PhilHealthNumber = message.PhilHealthPin?.Trim(),
            SeniorCitizenId = message.SeniorCitizenId?.Trim(),
            PwdId = message.PwdId?.Trim(),
            VerificationStatus = PatientVerificationStatus.PendingVerification,
            CustomFields = customFields,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "System:PatientJoin"
        };

        // Map PhilHealth Member Type credentials into relational PatientPhilHealthMembership
        if (!string.IsNullOrWhiteSpace(message.PhilHealthPin) || string.Equals(message.MemberType, "DD", StringComparison.OrdinalIgnoreCase))
        {
            var isDependent = string.Equals(message.MemberType, "DD", StringComparison.OrdinalIgnoreCase);
            var (principalFirstName, principalLastName) = SplitFullName(message.PrincipalFullName);

            var membership = new PatientPhilHealthMembership
            {
                Id = Guid.NewGuid(),
                TenantId = clinic.TenantId,
                ClinicId = clinic.ClinicId,
                PatientId = clinicPatient.Id,
                MemberPin = isDependent ? message.PrincipalMemberPin?.Trim() : message.PhilHealthPin?.Trim(),
                MemberType = isDependent ? PhilHealthMemberType.DD : PhilHealthMemberType.MM,
                PrincipalMemberPin = isDependent ? message.PrincipalMemberPin?.Trim() : null,
                PrincipalLastName = isDependent ? principalLastName : null,
                PrincipalFirstName = isDependent ? principalFirstName : null,
                PrincipalDateOfBirth = isDependent ? message.PrincipalDateOfBirth : null,
                DependentRelationship = isDependent && Enum.TryParse<PhilHealthDependentRelationship>(NormalizeRelationship(message.PrincipalRelationship), true, out var rel) ? rel : null,
                DefaultWalkInAtc = "A",
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "System:PatientJoin"
            };

            clinicPatient.PhilHealthMembership = membership;
            await _dbContext.PatientPhilHealthMemberships.AddAsync(membership, ct);
        }

        // Persist structured allergies in PatientAllergy
        if (message.Allergies != null && message.Allergies.Count > 0)
        {
            var allergyNames = new List<string>();
            foreach (var item in message.Allergies)
            {
                if (string.IsNullOrWhiteSpace(item.Allergen)) continue;

                var category = Enum.TryParse<AllergyCategory>(item.Category, true, out var cat) ? cat : AllergyCategory.Medication;
                var severity = Enum.TryParse<AllergySeverity>(item.Severity, true, out var sev)
                    ? sev
                    : (item.IsAnaphylactic ? AllergySeverity.LifeThreatening : AllergySeverity.Moderate);

                var allergy = new PatientAllergy
                {
                    Id = Guid.NewGuid(),
                    TenantId = clinic.TenantId,
                    ClinicId = clinic.ClinicId,
                    PatientId = clinicPatient.Id,
                    Allergen = item.Allergen.Trim(),
                    Category = category,
                    Severity = severity,
                    IsAnaphylactic = item.IsAnaphylactic,
                    AllergenDrugCode = item.AllergenDrugCode?.Trim(),
                    ReactionManifestation = item.ReactionManifestation?.Trim(),
                    OnsetDate = item.OnsetDate,
                    Notes = item.Notes?.Trim(),
                    Status = AllergyStatus.Active,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = "System:PatientJoin"
                };

                await _dbContext.PatientAllergies.AddAsync(allergy, ct);
                (clinicPatient.Allergies ??= new List<PatientAllergy>()).Add(allergy);
            }
        }

        // Daily sequential QueueItem token generation: Q-{seq:D3}
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var lastQueueSeq = await _dbContext.QueueItems
            .IgnoreQueryFilters()
            .Where(q => q.ClinicId == clinic.ClinicId && q.QueueDate == today)
            .MaxAsync(q => (int?)q.SequenceNumber, ct) ?? 0;

        var nextQueueSeq = lastQueueSeq + 1;
        var queueNumber = $"Q-{nextQueueSeq:D3}";

        var middleInitial = !string.IsNullOrWhiteSpace(clinicPatient.MiddleName) ? $" {clinicPatient.MiddleName[0]}." : "";
        var suffixStr = !string.IsNullOrWhiteSpace(clinicPatient.Suffix) ? $" {clinicPatient.Suffix}" : "";
        var fullPatientName = $"{clinicPatient.LastName}, {clinicPatient.FirstName}{middleInitial}{suffixStr}";

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = clinic.TenantId,
            ClinicId = clinic.ClinicId,
            QueueNumber = queueNumber,
            SequenceNumber = nextQueueSeq,
            QueueDate = today,
            PatientId = clinicPatient.Id,
            PatientName = fullPatientName,
            Priority = QueuePriority.Routine,
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow,
            ChiefComplaint = message.ReasonForVisit?.Trim(),
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "System:PatientJoin"
        };

        await _dbContext.QueueItems.AddAsync(queueItem, ct);

        // Quarantined attachments persistence into ClinicRecordAttachments
        if (message.Attachments != null && message.Attachments.Count > 0)
        {
            foreach (var att in message.Attachments)
            {
                var storageUri = att.StorageKey ?? att.StorageUri ?? $"tenants/{clinic.TenantId}/clinics/{clinic.ClinicId}/records/{Guid.NewGuid():N}.cez";
                var title = !string.IsNullOrWhiteSpace(att.Title)
                    ? att.Title.Trim()
                    : (!string.IsNullOrWhiteSpace(att.FileName) ? att.FileName.Trim() : "External Document");
                var fileName = !string.IsNullOrWhiteSpace(att.FileName) ? att.FileName.Trim() : "document.pdf";
                var contentType = !string.IsNullOrWhiteSpace(att.FileType)
                    ? att.FileType.Trim()
                    : (!string.IsNullOrWhiteSpace(att.ContentType) ? att.ContentType.Trim() : "application/pdf");
                var recordType = MapRecordType(att.Category ?? att.RecordType);

                var attachment = new RecordAttachment
                {
                    Id = att.Id.HasValue && att.Id.Value != Guid.Empty ? att.Id.Value : Guid.NewGuid(),
                    TenantId = clinic.TenantId,
                    ClinicId = clinic.ClinicId,
                    PatientId = clinicPatient.Id,
                    RecordType = recordType,
                    Title = title,
                    FileName = fileName,
                    ContentType = contentType,
                    FileSizeBytes = att.FileSizeBytes,
                    StorageUri = storageUri,
                    DocumentDate = att.DocumentDate ?? today,
                    Notes = att.Notes?.Trim() ?? "Uploaded by patient via public join registration",
                    UploadedByStaffName = "Patient Public Join Intake",
                    VerificationStatus = "PendingVerification",
                    EncryptionAlgorithm = "AES-256-GCM",
                    EncryptionKeyId = "cmk-v1",
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = "System:PatientJoin"
                };

                await _dbContext.RecordAttachments.AddAsync(attachment, ct);
            }
        }

        await _dbContext.Patients.AddAsync(clinicPatient, ct);

        const int maxAttempts = 3;
        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                await _dbContext.SaveChangesAsync(ct);
                break;
            }
            catch (DbUpdateException ex) when (PatientCodeCollisionDetector.IsPatientCodeCollision(ex))
            {
                if (attempt >= maxAttempts)
                {
                    throw new InvalidOperationException($"Failed to ingest patient join request after {maxAttempts} sequence allocation attempts.", ex);
                }

                var nextCode = await _codeGenerator.GenerateNextCodeAsync(clinic.TenantId, clinic.ClinicId, year, ct);
                clinicPatient.PatientCode = nextCode;
            }
        }

        _logger.LogInformation(
            "[PatientJoinRequestedHandler] Successfully ingested join request for patient {PatientId} ({PatientCode}) at clinic {ClinicId} with queue ticket {QueueNumber}.",
            clinicPatient.Id, clinicPatient.PatientCode, clinic.ClinicId, queueNumber);
    }

    private static string? NormalizeRelationship(string? rel)
    {
        if (string.IsNullOrWhiteSpace(rel)) return null;
        return rel.Trim().ToUpperInvariant() switch
        {
            "S" or "SPOUSE" => "S",
            "C" or "CHILD" => "C",
            "P" or "PARENT" => "P",
            "D" or "DISABLED" => "D",
            _ => rel.Length == 1 ? rel.ToUpperInvariant() : "C"
        };
    }

    private static (string? FirstName, string? LastName) SplitFullName(string? fullName)
    {
        if (string.IsNullOrWhiteSpace(fullName)) return (null, null);
        var parts = fullName.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 1) return (parts[0], parts[0]);
        var firstName = string.Join(" ", parts[..^1]);
        var lastName = parts[^1];
        return (firstName, lastName);
    }

    internal static string MapRecordType(string? docTypeCode)
    {
        if (string.IsNullOrWhiteSpace(docTypeCode)) return "LabResult";
        return docTypeCode.Trim().ToLowerInvariant() switch
        {
            "xray" or "outsidechestxray" or "chest-xray" or "radiology" => "OutsideChestXRay",
            "lab-result" or "labresult" or "lab" => "LabResult",
            "imaging" or "imagingreport" => "ImagingReport",
            "medical-certificate" or "medicalcertificate" or "medcert" => "MedicalCertificate",
            "referral" or "externalreferral" => "ExternalReferral",
            "pulmonary" or "spirometry" => "DiagnosticReport",
            "immunization" => "ImmunizationRecord",
            _ => "LabResult"
        };
    }
}
