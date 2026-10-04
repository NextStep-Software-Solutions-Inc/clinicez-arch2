using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Consumers;

public sealed class AppointmentBookedConsumer : IConsumer<AppointmentBookedEvent>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly IClinicContext _clinicContext;
    private readonly ILogger<AppointmentBookedConsumer> _logger;

    public AppointmentBookedConsumer(
        ApplicationDbContext dbContext,
        IClinicContext clinicContext,
        ILogger<AppointmentBookedConsumer> logger)
    {
        _dbContext = dbContext;
        _clinicContext = clinicContext;
        _logger = logger;
    }

    public async Task Consume(ConsumeContext<AppointmentBookedEvent> context)
    {
        var message = context.Message;

        // Clinic jurisdiction validation: Only ingest appointments intended for this clinic facility
        if (_clinicContext.ClinicId != Guid.Empty && message.ClinicId != _clinicContext.ClinicId)
        {
            _logger.LogInformation(
                "[AppointmentBookedConsumer] Ignoring event for clinic {MessageClinicId}, current clinic is {CurrentClinicId}",
                message.ClinicId, _clinicContext.ClinicId);
            return;
        }

        _logger.LogInformation(
            "[AppointmentBookedConsumer] Ingesting appointment booking Draft {DraftId} for Patient {PatientId} at Clinic {ClinicId}",
            message.DraftId, message.PatientId, message.ClinicId);

        // Check if already ingested idempotently
        var existing = await _dbContext.Appointments
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(a => a.DraftId == message.DraftId, context.CancellationToken);

        if (existing != null)
        {
            _logger.LogInformation("[AppointmentBookedConsumer] Appointment for draft {DraftId} already exists ({Id}). Skipping.", message.DraftId, existing.Id);
            return;
        }

        // Locate or auto-provision ClinicPatient
        var tenantId = message.TenantId ?? _clinicContext.TenantId ?? "default";
        var clinicPatient = await _dbContext.Patients
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(p =>
                (p.ClinicId == message.ClinicId || p.ClinicId == Guid.Empty) &&
                (p.Id == message.PatientId || p.SyncPatientId == message.PatientId ||
                 (!string.IsNullOrEmpty(message.PhilHealthNumber) && p.PhilHealthNumber == message.PhilHealthNumber)),
                context.CancellationToken);

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
            await _dbContext.Patients.AddAsync(clinicPatient, context.CancellationToken);
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

        await _dbContext.Appointments.AddAsync(appointment, context.CancellationToken);

        // Ingest any patient-attached external files as ClinicRecordAttachment rows
        if (message.AttachedFiles != null && message.AttachedFiles.Count > 0)
        {
            foreach (var file in message.AttachedFiles)
            {
                var storageKey = $"tenants/{tenantId}/clinics/{message.ClinicId}/records/{file.FileId}.cez";
                var existingAttachment = await _dbContext.RecordAttachments
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(a => a.ClinicId == message.ClinicId && (a.Id == file.FileId || a.StorageUri == storageKey), context.CancellationToken);

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
                    await _dbContext.RecordAttachments.AddAsync(attachment, context.CancellationToken);
                }
                else
                {
                    existingAttachment.PatientId = clinicPatient.Id;
                    _dbContext.RecordAttachments.Update(existingAttachment);
                }
            }
        }

        await _dbContext.SaveChangesAsync(context.CancellationToken);

        _logger.LogInformation("[AppointmentBookedConsumer] Ingested appointment {AppointmentId} and synchronized patient {PatientId} successfully", appointment.Id, clinicPatient.Id);
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

