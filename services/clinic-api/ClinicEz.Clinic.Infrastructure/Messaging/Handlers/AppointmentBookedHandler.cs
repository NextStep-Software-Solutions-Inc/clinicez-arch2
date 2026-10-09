using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging;

/// <summary>
/// Ingests a patient's booking (<c>patient.appointment.booked</c>) into the addressed clinic and confirms it back to
/// the patient. Idempotent per booking draft: a redelivered message finds the appointment it already created.
/// </summary>
public sealed class AppointmentBookedHandler : IInteropHandler<AppointmentBookedEvent>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ClinicRecipientResolver _recipient;
    private readonly IInteropPublisher _publisher;
    private readonly ILogger<AppointmentBookedHandler> _logger;

    public AppointmentBookedHandler(
        ApplicationDbContext dbContext,
        ClinicRecipientResolver recipient,
        IInteropPublisher publisher,
        ILogger<AppointmentBookedHandler> logger)
    {
        _dbContext = dbContext;
        _recipient = recipient;
        _publisher = publisher;
        _logger = logger;
    }

    public async Task HandleAsync(AppointmentBookedEvent message, InteropMessageContext context, CancellationToken ct)
    {
        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic == null) return;

        // Clinic jurisdiction validation: only ingest appointments intended for the addressed clinic facility.
        if (message.ClinicId != clinic.ClinicId ||
            (!string.IsNullOrWhiteSpace(message.TenantId) &&
             !string.Equals(message.TenantId, clinic.TenantId, StringComparison.OrdinalIgnoreCase)))
        {
            _logger.LogWarning(
                "[AppointmentBookedHandler] Ignoring booking {DraftId}: its clinic {MessageClinicId} does not match the addressed clinic {ClinicId}",
                message.DraftId, message.ClinicId, clinic.ClinicId);
            return;
        }

        _logger.LogInformation(
            "[AppointmentBookedHandler] Ingesting appointment booking Draft {DraftId} for Patient {PatientId} at Clinic {ClinicId}",
            message.DraftId, message.PatientId, message.ClinicId);

        // Check if already ingested idempotently
        var existing = await _dbContext.Appointments
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(a => a.DraftId == message.DraftId && a.ClinicId == clinic.ClinicId, ct);

        if (existing != null)
        {
            _logger.LogInformation("[AppointmentBookedHandler] Appointment for draft {DraftId} already exists ({Id}). Skipping.", message.DraftId, existing.Id);
            return;
        }

        // Locate or auto-provision ClinicPatient
        var tenantId = clinic.TenantId;
        var clinicPatient = await _dbContext.Patients
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(p =>
                (p.ClinicId == message.ClinicId || p.ClinicId == Guid.Empty) &&
                (p.Id == message.PatientId || p.SyncPatientId == message.PatientId ||
                 (!string.IsNullOrEmpty(message.PhilHealthNumber) && p.PhilHealthNumber == message.PhilHealthNumber)),
                ct);

        var isNewPatient = false;
        if (clinicPatient == null)
        {
            isNewPatient = true;
            clinicPatient = new ClinicPatient
            {
                Id = message.PatientId,
                SyncPatientId = message.PatientId,
                TenantId = tenantId,
                ClinicId = message.ClinicId,
                PatientCode = $"PAT-{DateTime.UtcNow:yyyyMMdd}-{message.PatientId.ToString()[..6].ToUpper()}",
                FirstName = !string.IsNullOrWhiteSpace(message.PatientFirstName) ? message.PatientFirstName : "Patient",
                LastName = !string.IsNullOrWhiteSpace(message.PatientLastName) ? message.PatientLastName : message.PatientId.ToString()[..8],
                MiddleName = message.PatientMiddleName,
                Suffix = message.PatientSuffix,
                DateOfBirth = message.DateOfBirth ?? new DateOnly(2000, 1, 1),
                Gender = !string.IsNullOrWhiteSpace(message.Gender) ? message.Gender : "Other",
                ContactNumber = !string.IsNullOrWhiteSpace(message.ContactNumber) ? message.ContactNumber : "N/A",
                Email = message.Email,
                PhilHealthNumber = message.PhilHealthNumber,
                CustomFields = new Dictionary<string, object?>()
            };
        }
        else
        {
            if (string.IsNullOrWhiteSpace(clinicPatient.PhilHealthNumber) && !string.IsNullOrWhiteSpace(message.PhilHealthNumber))
            {
                clinicPatient.PhilHealthNumber = message.PhilHealthNumber;
            }
            if (clinicPatient.SyncPatientId == null)
            {
                clinicPatient.SyncPatientId = message.PatientId;
            }
            clinicPatient.CustomFields ??= new Dictionary<string, object?>();
        }

        // Prepopulate PhilHealth & Dependent Sponsor profile in CustomFields
        if (!string.IsNullOrWhiteSpace(message.PhilHealthNumber))
        {
            var isDependent = string.Equals(message.PhilHealthCategory, "DD", StringComparison.OrdinalIgnoreCase);
            var profile = new PhilHealthPatientProfileDto
            {
                Pin = message.PhilHealthNumber,
                MemberPin = isDependent ? message.SponsorPin : message.PhilHealthNumber,
                MemberType = isDependent ? "DD" : "MM",
                MemberLastName = isDependent ? message.SponsorLastName : (message.PatientLastName ?? clinicPatient.LastName),
                MemberFirstName = isDependent ? message.SponsorFirstName : (message.PatientFirstName ?? clinicPatient.FirstName),
                MemberMiddleName = isDependent ? message.SponsorMiddleName : (message.PatientMiddleName ?? clinicPatient.MiddleName),
                MemberSuffix = isDependent ? message.SponsorSuffix : (message.PatientSuffix ?? clinicPatient.Suffix),
                MemberBirthDate = isDependent ? message.SponsorDob?.ToString("yyyy-MM-dd") : (message.DateOfBirth ?? clinicPatient.DateOfBirth).ToString("yyyy-MM-dd"),
                DependentRelationship = isDependent ? NormalizeRelationship(message.SponsorRelationship) : null,
                Atc = "A",
                IsWalkedIn = "N"
            };

            clinicPatient.CustomFields["philhealth_profile"] = profile;
        }

        if (isNewPatient)
        {
            await _dbContext.Patients.AddAsync(clinicPatient, ct);
        }
        else
        {
            _dbContext.Patients.Update(clinicPatient);
        }

        // Parse scheduled time
        var scheduledAt = DateTime.UtcNow;
        if (message.PreferredDate.HasValue)
        {
            var date = message.PreferredDate.Value;
            if (!string.IsNullOrWhiteSpace(message.PreferredTime) &&
                TimeOnly.TryParse(message.PreferredTime, out var parsedTime))
            {
                scheduledAt = new DateTime(date.Year, date.Month, date.Day, parsedTime.Hour, parsedTime.Minute, 0, DateTimeKind.Utc);
            }
            else
            {
                scheduledAt = new DateTime(date.Year, date.Month, date.Day, 9, 0, 0, DateTimeKind.Utc);
            }
        }

        var patientDisplayName = $"{clinicPatient.FirstName} {clinicPatient.LastName}".Trim();
        if (string.IsNullOrWhiteSpace(patientDisplayName))
        {
            patientDisplayName = $"Patient-{message.PatientId.ToString()[..8]}";
        }

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            DraftId = message.DraftId,
            TenantId = tenantId,
            ClinicId = message.ClinicId,
            PatientId = clinicPatient.Id,
            PatientName = patientDisplayName,
            ScheduledAt = scheduledAt,
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reason = message.Reason ?? "General Consultation",
            Notes = message.Notes,
            ShareFieldsJson = message.ShareFieldsJson,
            AttachedFileIdsJson = message.AttachedFileIdsJson,
            CreatedAt = message.CreatedAt,
            CreatedBy = "System:PatientBookingEvent"
        };

        await _dbContext.Appointments.AddAsync(appointment, ct);

        // Ingest any patient-attached external files as ClinicRecordAttachment rows
        if (message.AttachedFiles != null && message.AttachedFiles.Count > 0)
        {
            foreach (var file in message.AttachedFiles)
            {
                var storageKey = $"tenants/{tenantId}/clinics/{message.ClinicId}/records/{file.FileId}.cez";
                var existingAttachment = await _dbContext.RecordAttachments
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(a => a.ClinicId == message.ClinicId && (a.Id == file.FileId || a.StorageUri == storageKey), ct);

                if (existingAttachment == null)
                {
                    var attachment = new ClinicRecordAttachment
                    {
                        Id = file.FileId != Guid.Empty ? file.FileId : Guid.NewGuid(),
                        TenantId = tenantId,
                        ClinicId = message.ClinicId,
                        PatientId = clinicPatient.Id,
                        RecordType = MapRecordType(file.DocumentTypeCode),
                        Title = !string.IsNullOrWhiteSpace(file.FileName) ? file.FileName : "Attached Document",
                        FileName = !string.IsNullOrWhiteSpace(file.FileName) ? file.FileName : "attachment.bin",
                        ContentType = file.MimeType ?? "application/pdf",
                        FileSizeBytes = file.SizeBytes,
                        StorageUri = storageKey,
                        DocumentDate = DateOnly.FromDateTime(DateTime.UtcNow),
                        Notes = $"Attached by patient during booking (Draft #{message.DraftId:N})",
                        UploadedByStaffName = "Student Self-Upload (Mobile Portal)",
                        VerificationStatus = "PendingVerification",
                        EncryptionAlgorithm = "AES-256-GCM",
                        EncryptionKeyId = "cmk-v1",
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = "System:PatientBookingEvent"
                    };
                    await _dbContext.RecordAttachments.AddAsync(attachment, ct);
                }
                else
                {
                    existingAttachment.PatientId = clinicPatient.Id;
                    _dbContext.RecordAttachments.Update(existingAttachment);
                }
            }
        }

        // Confirm the booking to the patient in the same transaction as the ingested appointment.
        _publisher.Enqueue(
            InteropTypes.ClinicAppointmentUpdated,
            ClinicParties.Clinic(clinic.TenantId, clinic.ClinicId.ToString()),
            Party.ForPatient(message.PatientId.ToString()),
            message.DraftId,
            new ClinicAppointmentUpdatedEvent
            {
                ClinicId = clinic.ClinicId,
                TenantId = clinic.TenantId,
                PatientId = message.PatientId,
                Appointments =
                {
                    new ClinicAppointmentSnapshotDto
                    {
                        Id = appointment.Id.ToString(),
                        ClinicId = clinic.ClinicId.ToString(),
                        ClinicName = clinic.ClinicName,
                        ServiceType = appointment.ServiceType,
                        ScheduledAt = appointment.ScheduledAt.ToString("O"),
                        DurationMinutes = appointment.DurationMinutes,
                        Status = appointment.Status.ToString(),
                        Notes = appointment.Notes,
                        Subject = appointment.Reason,
                        DraftId = message.DraftId
                    }
                }
            });

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation("[AppointmentBookedHandler] Ingested appointment {AppointmentId} and synchronized patient {PatientId} successfully", appointment.Id, clinicPatient.Id);
    }

    private static string MapRecordType(string? docTypeCode)
    {
        if (string.IsNullOrWhiteSpace(docTypeCode)) return "Other";
        return docTypeCode.Trim().ToLowerInvariant() switch
        {
            "xray" or "outsidechestxray" or "chest-xray" => "OutsideChestXRay",
            "lab-result" or "labresult" or "lab" => "LabResult",
            "medical-certificate" or "medicalcertificate" or "medcert" => "MedicalCertificate",
            "id" or "certificateofregistration" or "cor" or "student-id" => "CertificateOfRegistration",
            _ => "Other"
        };
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
}
