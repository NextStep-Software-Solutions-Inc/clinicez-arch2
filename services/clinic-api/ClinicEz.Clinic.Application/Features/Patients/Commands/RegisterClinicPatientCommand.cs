using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Allergies.Dtos;
using ClinicEz.Clinic.Application.Features.CustomFields.Validation;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Workspace;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

public sealed record RegisterClinicPatientCommand(
    string FirstName,
    string LastName,
    string? MiddleName,
    string? Suffix,
    DateOnly DateOfBirth,
    string Sex,
    string? CivilStatus,
    string ContactNumber,
    string? Email,
    string? AddressLine,
    string? Barangay,
    string? City,
    string? Province,
    string? EmergencyContactName,
    string? EmergencyContactPhone,
    string? EmergencyContactRelationship,
    string? PhilHealthNumber,
    string? SeniorCitizenId,
    string? PwdId,
    string? BloodType,
    string? Allergies,
    string? ChronicConditions,
    string? Alerts,
    Guid? CloudPatientId = null,
    System.Collections.Generic.Dictionary<string, object?>? CustomFields = null,
    string VerificationStatus = "Verified",
    List<CreateAllergyRequest>? StructuredAllergies = null,
    bool SendToTriage = false,
    string? Priority = "Normal",
    string? ChiefComplaint = null,
    List<MedicalHistoryEntryDto>? MedicalHistories = null,
    Guid? DoctorId = null,
    string? DoctorName = null,
    Guid? RoomId = null,
    string? RoomOrStation = null,
    DateOnly? QueueDate = null,
    string? LandlineNumber = null,
    string? MaidenLastName = null,
    string? PreferredName = null,
    string? Nationality = null,
    string? Religion = null,
    Guid? SyncPatientId = null,
    string? GenderIdentity = null) : IRequest<ClinicPatientDto>;

public sealed class RegisterClinicPatientCommandHandler : IRequestHandler<RegisterClinicPatientCommand, ClinicPatientDto>
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<PatientAllergy>? _allergyRepo;
    private readonly IRepository<QueueItem>? _queueRepo;
    private readonly IRepository<PatientMedicalHistory>? _medicalRepo;
    private readonly IPatientCodeGenerator _codeGenerator;
    private readonly IRepository<StaffMember>? _staffRepo;
    private readonly IRepository<Room>? _roomRepo;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;
    private readonly IRepository<FacilitySettings>? _settingsRepo;
    private readonly IRepository<CustomFieldDefinition>? _customFieldRepo;

    public RegisterClinicPatientCommandHandler(
        IRepository<Patient> patientRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<PatientAllergy>? allergyRepo = null,
        IRepository<QueueItem>? queueRepo = null,
        IRepository<PatientMedicalHistory>? medicalRepo = null,
        IPatientCodeGenerator? codeGenerator = null,
        IRepository<StaffMember>? staffRepo = null,
        IRepository<Room>? roomRepo = null,
        IWorkspaceProfileProvider? workspaceProfiles = null,
        IRepository<FacilitySettings>? settingsRepo = null,
        IRepository<CustomFieldDefinition>? customFieldRepo = null)
    {
        _patientRepo = patientRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _allergyRepo = allergyRepo;
        _queueRepo = queueRepo;
        _medicalRepo = medicalRepo;
        _codeGenerator = codeGenerator ?? ResolveFallbackCodeGenerator(patientRepo, unitOfWork);
        _staffRepo = staffRepo;
        _roomRepo = roomRepo;
        _workspaceProfiles = workspaceProfiles;
        _settingsRepo = settingsRepo;
        _customFieldRepo = customFieldRepo;
    }

    private static IPatientCodeGenerator ResolveFallbackCodeGenerator(
        IRepository<Patient> patientRepo,
        IUnitOfWork unitOfWork)
    {
        var dbContext = (patientRepo.GetType().GetProperty("DbContext")?.GetValue(patientRepo)
            ?? unitOfWork.GetType().GetProperty("DbContext")?.GetValue(unitOfWork)) as DbContext;

        if (dbContext != null)
        {
            var genType = Type.GetType("ClinicEz.Clinic.Infrastructure.Services.PatientCodeGenerator, ClinicEz.Clinic.Infrastructure")
                ?? AppDomain.CurrentDomain.GetAssemblies()
                    .Select(a => a.GetType("ClinicEz.Clinic.Infrastructure.Services.PatientCodeGenerator"))
                    .FirstOrDefault(t => t != null);

            if (genType != null)
            {
                return (IPatientCodeGenerator)Activator.CreateInstance(genType, dbContext, null)!;
            }
        }

        throw new InvalidOperationException("IPatientCodeGenerator must be provided or registered in DI.");
    }

    public async Task<ClinicPatientDto> Handle(RegisterClinicPatientCommand request, CancellationToken ct)
    {
        var year = DateTime.UtcNow.Year;
        var patientCode = await _codeGenerator.GenerateNextCodeAsync(_clinicContext.TenantId, _clinicContext.ClinicId, year, ct);

        // Prepare custom fields dictionary and map intake address / emergency contact
        var customFields = request.CustomFields != null
            ? new System.Collections.Generic.Dictionary<string, object?>(request.CustomFields)
            : new System.Collections.Generic.Dictionary<string, object?>();

        if (_customFieldRepo != null)
        {
            await CustomFieldValueValidator.ValidateAndNormalizeAsync(
                customFields,
                _customFieldRepo,
                "Patient",
                ct);
        }

        if (!string.IsNullOrWhiteSpace(request.AddressLine) && !customFields.ContainsKey("primary_address_line"))
            customFields["primary_address_line"] = request.AddressLine.Trim();

        if (!string.IsNullOrWhiteSpace(request.Barangay) && !customFields.ContainsKey("primary_barangay"))
            customFields["primary_barangay"] = request.Barangay.Trim();

        if (!string.IsNullOrWhiteSpace(request.City) && !customFields.ContainsKey("primary_city"))
            customFields["primary_city"] = request.City.Trim();

        if (!string.IsNullOrWhiteSpace(request.Province) && !customFields.ContainsKey("primary_province"))
            customFields["primary_province"] = request.Province.Trim();

        if (!string.IsNullOrWhiteSpace(request.EmergencyContactName) && !customFields.ContainsKey("emergency_contact_name"))
            customFields["emergency_contact_name"] = request.EmergencyContactName.Trim();

        if (!string.IsNullOrWhiteSpace(request.EmergencyContactPhone) && !customFields.ContainsKey("emergency_contact_phone"))
            customFields["emergency_contact_phone"] = request.EmergencyContactPhone.Trim();

        if (!string.IsNullOrWhiteSpace(request.EmergencyContactRelationship) && !customFields.ContainsKey("emergency_contact_relationship"))
            customFields["emergency_contact_relationship"] = request.EmergencyContactRelationship.Trim();

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            PatientCode = patientCode,
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            MiddleName = request.MiddleName?.Trim(),
            Suffix = request.Suffix?.Trim(),
            DateOfBirth = request.DateOfBirth,
            Sex = ParseBiologicalSex(request.Sex),
            GenderIdentity = NormalizeGenderIdentity(request.GenderIdentity),
            CivilStatus = ParseCivilStatus(request.CivilStatus),
            ContactNumber = request.ContactNumber.Trim(),
            Email = request.Email?.Trim(),
            PhilHealthNumber = request.PhilHealthNumber?.Trim(),
            SeniorCitizenId = request.SeniorCitizenId?.Trim(),
            PwdId = request.PwdId?.Trim(),
            BloodType = Enum.TryParse<BloodType>(request.BloodType, true, out var bt) ? bt : null,
            LandlineNumber = request.LandlineNumber?.Trim(),
            MaidenLastName = request.MaidenLastName?.Trim(),
            PreferredName = request.PreferredName?.Trim(),
            Nationality = request.Nationality?.Trim(),
            Religion = request.Religion?.Trim(),
            CustomFields = customFields,
            VerificationStatus = Enum.TryParse<PatientVerificationStatus>(request.VerificationStatus, true, out var vs) ? vs : PatientVerificationStatus.Verified,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicStaff"
        };
        var effectiveCloudPatientId = request.CloudPatientId ?? request.SyncPatientId;
        if (effectiveCloudPatientId.HasValue && effectiveCloudPatientId.Value != Guid.Empty)
        {
            patient.LinkCloudAccount(effectiveCloudPatientId.Value, null);
        }

        await _patientRepo.AddAsync(patient, ct);

        // 1. Ingest Structured or Legacy String Allergies
        if (request.StructuredAllergies != null && request.StructuredAllergies.Count > 0)
        {
            foreach (var allergyReq in request.StructuredAllergies)
            {
                if (string.IsNullOrWhiteSpace(allergyReq.Allergen)) continue;

                var category = Enum.TryParse<AllergyCategory>(allergyReq.Category, true, out var parsedCategory)
                    ? parsedCategory
                    : AllergyCategory.Medication;

                var severity = Enum.TryParse<AllergySeverity>(allergyReq.Severity, true, out var parsedSeverity)
                    ? parsedSeverity
                    : (allergyReq.IsAnaphylactic ? AllergySeverity.LifeThreatening : AllergySeverity.Moderate);

                var allergy = new PatientAllergy
                {
                    Id = Guid.NewGuid(),
                    TenantId = _clinicContext.TenantId,
                    ClinicId = _clinicContext.ClinicId,
                    PatientId = patient.Id,
                    Category = category,
                    Allergen = allergyReq.Allergen.Trim(),
                    AllergenDrugCode = allergyReq.AllergenDrugCode?.Trim(),
                    Severity = severity,
                    ReactionManifestation = allergyReq.ReactionManifestation?.Trim(),
                    IsAnaphylactic = allergyReq.IsAnaphylactic || severity == AllergySeverity.LifeThreatening,
                    Status = AllergyStatus.Active,
                    OnsetDate = allergyReq.OnsetDate,
                    Notes = allergyReq.Notes?.Trim(),
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicStaff"
                };

                (patient.Allergies ??= new List<PatientAllergy>()).Add(allergy);
                if (_allergyRepo != null)
                {
                    await _allergyRepo.AddAsync(allergy, ct);
                }
            }
        }
        else if (!string.IsNullOrWhiteSpace(request.Allergies))
        {
            var allergens = request.Allergies.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            foreach (var a in allergens)
            {
                var allergy = new PatientAllergy
                {
                    Id = Guid.NewGuid(),
                    TenantId = _clinicContext.TenantId,
                    ClinicId = _clinicContext.ClinicId,
                    PatientId = patient.Id,
                    Category = AllergyCategory.Other,
                    Allergen = a,
                    Severity = AllergySeverity.Moderate,
                    Status = AllergyStatus.Active,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicStaff"
                };
                (patient.Allergies ??= new List<PatientAllergy>()).Add(allergy);
                if (_allergyRepo != null)
                {
                    await _allergyRepo.AddAsync(allergy, ct);
                }
            }
        }

        // 1b. Ingest Alerts
        if (!string.IsNullOrWhiteSpace(request.Alerts))
        {
            var alertTitles = request.Alerts.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            foreach (var title in alertTitles)
            {
                var alert = new PatientAlert
                {
                    Id = Guid.NewGuid(),
                    TenantId = _clinicContext.TenantId,
                    ClinicId = _clinicContext.ClinicId,
                    PatientId = patient.Id,
                    Title = title,
                    Category = PatientAlertCategory.ClinicalSafety,
                    Status = PatientAlertStatus.Active,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicStaff"
                };
                patient.Alerts.Add(alert);
            }
        }

        if (!string.IsNullOrWhiteSpace(request.ChronicConditions))
        {
            var split = request.ChronicConditions.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            foreach (var cond in split)
            {
                if (!patient.MedicalHistories.Any(m => string.Equals(m.ConditionTitle, cond, StringComparison.OrdinalIgnoreCase)))
                {
                    var hist = new PatientMedicalHistory
                    {
                        Id = Guid.NewGuid(),
                        TenantId = _clinicContext.TenantId,
                        ClinicId = _clinicContext.ClinicId,
                        PatientId = patient.Id,
                        Category = MedicalHistoryCategory.MedicalHistory,
                        ConditionTitle = cond,
                        IsChronicNcd = true,
                        Status = ProblemStatus.Active,
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicStaff"
                    };
                    if (_medicalRepo != null) await _medicalRepo.AddAsync(hist, ct);
                    patient.MedicalHistories.Add(hist);
                }
            }
        }

        // 2. Ingest Structured Medical Histories
        if (request.MedicalHistories != null && request.MedicalHistories.Count > 0 && _medicalRepo != null)
        {
            foreach (var medReq in request.MedicalHistories)
            {
                if (string.IsNullOrWhiteSpace(medReq.ConditionTitle)) continue;

                var history = new PatientMedicalHistory
                {
                    Id = medReq.Id.HasValue && medReq.Id.Value != Guid.Empty ? medReq.Id.Value : Guid.NewGuid(),
                    TenantId = _clinicContext.TenantId,
                    ClinicId = _clinicContext.ClinicId,
                    PatientId = patient.Id,
                    Category = MedicalHistoryCategory.MedicalHistory,
                    ConditionTitle = medReq.ConditionTitle.Trim(),
                    PhilHealthMdiseaseCode = medReq.PhilHealthMdiseaseCode?.Trim(),
                    Icd10Code = medReq.Icd10Code?.Trim(),
                    SpecificDescription = medReq.SpecificDescription?.Trim(),
                    OnsetDate = medReq.OnsetDate,
                    Status = medReq.IsResolved ? ProblemStatus.Resolved : ProblemStatus.Active,
                    ClinicalNotes = medReq.ClinicalNotes?.Trim(),
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicStaff"
                };

                await _medicalRepo.AddAsync(history, ct);
                if (!patient.MedicalHistories.Any(x => x.Id == history.Id))
                {
                    patient.MedicalHistories.Add(history);
                }
            }
        }

        // 3. 1-Click "Send to Triage" Flow
        QueueItem? queueItem = null;
        if (request.SendToTriage && _queueRepo != null)
        {
            var today = request.QueueDate
                ?? await ClinicTimeZoneResolver.ResolveTodayAsync(_workspaceProfiles, _clinicContext.TenantId, ct, _settingsRepo);
            var lastSequence = await _queueRepo.Query(q =>
                q.ClinicId == _clinicContext.ClinicId &&
                q.QueueDate == today)
                .MaxAsync(q => (int?)q.SequenceNumber, ct) ?? 0;

            var nextSequence = lastSequence + 1;
            var queueNumber = $"Q-{nextSequence:D3}";

            var priority = QueuePriority.Routine;
            if (!string.IsNullOrWhiteSpace(request.Priority))
            {
                if (request.Priority.Equals("Urgent", StringComparison.OrdinalIgnoreCase))
                    priority = QueuePriority.Urgent;
                else if (request.Priority.Equals("Emergency", StringComparison.OrdinalIgnoreCase))
                    priority = QueuePriority.Emergency;
            }

            var middleInitial = !string.IsNullOrWhiteSpace(patient.MiddleName) ? $" {patient.MiddleName[0]}." : "";
            var suffix = !string.IsNullOrWhiteSpace(patient.Suffix) ? $" {patient.Suffix}" : "";
            var fullName = $"{patient.LastName}, {patient.FirstName}{middleInitial}{suffix}";

            Guid? resolvedDoctorId = request.DoctorId;
            string? resolvedDoctorName = request.DoctorName;
            Guid? resolvedRoomId = request.RoomId;
            string? resolvedRoomOrStation = request.RoomOrStation?.Trim();

            if (resolvedDoctorId.HasValue && _staffRepo != null)
            {
                var doctor = await _staffRepo
                    .Query(s => s.Id == resolvedDoctorId.Value && s.ClinicId == _clinicContext.ClinicId)
                    .FirstOrDefaultAsync(ct);

                if (doctor != null)
                {
                    if (string.IsNullOrWhiteSpace(resolvedDoctorName))
                    {
                        var prefix = !string.IsNullOrWhiteSpace(doctor.Title) ? $"{doctor.Title} " : "Dr. ";
                        resolvedDoctorName = $"{prefix}{doctor.FirstName} {doctor.LastName}".Trim();
                    }

                    // Default the room to the primary room of the doctor selected if not explicitly passed
                    if (!resolvedRoomId.HasValue && _roomRepo != null)
                    {
                        var doctorRoomIds = doctor.GetAssignedRoomIds();
                        if (doctorRoomIds.Count > 0)
                        {
                            var activeRooms = await _roomRepo
                                .Query(r => r.ClinicId == _clinicContext.ClinicId && doctorRoomIds.Contains(r.Id) && r.IsActive)
                                .OrderBy(r => r.DisplayOrder)
                                .ToListAsync(ct);

                            var firstActive = activeRooms.FirstOrDefault();
                            if (firstActive != null)
                            {
                                resolvedRoomId = firstActive.Id;
                                resolvedRoomOrStation = firstActive.Name;
                            }
                        }
                    }
                }
            }

            if (resolvedRoomId.HasValue && _roomRepo != null)
            {
                var room = await _roomRepo
                    .Query(r => r.Id == resolvedRoomId.Value && r.ClinicId == _clinicContext.ClinicId)
                    .FirstOrDefaultAsync(ct);
                if (room != null)
                {
                    resolvedRoomId = room.Id;
                    resolvedRoomOrStation = room.Name;
                }
            }

            queueItem = new QueueItem
            {
                Id = Guid.NewGuid(),
                TenantId = _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                QueueNumber = queueNumber,
                SequenceNumber = nextSequence,
                QueueDate = today,
                PatientId = patient.Id,
                PatientName = fullName,
                Priority = priority,
                Status = QueueStatus.Waiting, // Routes to nursing triage queue
                CheckInTime = DateTime.UtcNow,
                ChiefComplaint = request.ChiefComplaint?.Trim(),
                DoctorId = resolvedDoctorId,
                DoctorName = resolvedDoctorName,
                RoomId = resolvedRoomId,
                RoomOrStation = resolvedRoomOrStation,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = _clinicContext.StaffId?.ToString() ?? "FrontDesk"
            };

            await _queueRepo.AddAsync(queueItem, ct);
        }

        string? allergiesSummary = null;
        if (!string.IsNullOrWhiteSpace(request.Allergies) && request.StructuredAllergies != null && request.StructuredAllergies.Count > 0)
        {
            var existingItems = request.Allergies.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            var structuredItems = patient.Allergies?.Select(a => a.Allergen).Where(a => !existingItems.Contains(a, StringComparer.OrdinalIgnoreCase)) ?? Enumerable.Empty<string>();
            allergiesSummary = string.Join(", ", existingItems.Concat(structuredItems));
        }

        const int maxAttempts = 3;
        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                await _unitOfWork.SaveChangesAsync(ct);
                return MapToDto(patient, queueItem?.QueueNumber, queueItem?.Id, allergiesSummary);
            }
            catch (DbUpdateException ex) when (PatientCodeCollisionDetector.IsPatientCodeCollision(ex))
            {
                if (attempt >= maxAttempts)
                {
                    throw new InvalidOperationException("Failed to register patient after multiple sequence allocation attempts.", ex);
                }

                var nextCode = await _codeGenerator.GenerateNextCodeAsync(_clinicContext.TenantId, _clinicContext.ClinicId, year, ct);
                patient.PatientCode = nextCode;
            }
        }

        throw new InvalidOperationException("Failed to register patient after multiple sequence allocation attempts.");
    }

    public static ClinicPatientDto MapToDto(Patient p) => MapToDto(p, null, null, null);

    public static ClinicPatientDto MapToDto(Patient p, string? activeQueueTicket, Guid? activeQueueItemId) => MapToDto(p, activeQueueTicket, activeQueueItemId, null);

    public static ClinicPatientDto MapToDto(Patient p, string? activeQueueTicket, Guid? activeQueueItemId, string? allergiesOverride)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var age = today.Year - p.DateOfBirth.Year;
        if (p.DateOfBirth > today.AddYears(-age)) age--;

        var middleInitial = !string.IsNullOrWhiteSpace(p.MiddleName) ? $" {p.MiddleName[0]}." : "";
        var suffix = !string.IsNullOrWhiteSpace(p.Suffix) ? $" {p.Suffix}" : "";
        var fullName = $"{p.LastName}, {p.FirstName}{middleInitial}{suffix}";

        var pastMedicalHistories = p.MedicalHistories?
            .Where(m => !m.IsDeleted && m.Category == MedicalHistoryCategory.MedicalHistory)
            .DistinctBy(m => m.Id)
            .Select(m => new PatientPastMedicalHistoryDto(
                m.Id,
                m.PatientId,
                m.ConditionTitle,
                m.PhilHealthMdiseaseCode,
                m.Icd10Code,
                m.SpecificDescription,
                m.OnsetDate,
                m.Status == ProblemStatus.Resolved,
                m.ClinicalNotes,
                m.CreatedAt)).ToList();

        var allergiesText = allergiesOverride ?? (p.Allergies != null && p.Allergies.Count > 0
            ? string.Join(", ", p.Allergies.Where(a => !a.IsDeleted && a.Status == AllergyStatus.Active).Select(a => a.Allergen))
            : null);
        if (string.IsNullOrWhiteSpace(allergiesText)) allergiesText = null;

        var chronicConditions = p.MedicalHistories != null && p.MedicalHistories.Count > 0
            ? string.Join(", ", p.MedicalHistories.Where(m => !m.IsDeleted).Select(m => (!string.IsNullOrWhiteSpace(m.SpecificDescription) && (string.Equals(m.ConditionTitle, "Others", StringComparison.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(m.ConditionTitle))) ? m.SpecificDescription.Trim() : m.ConditionTitle.Trim()).Where(s => !string.IsNullOrWhiteSpace(s)).Distinct(StringComparer.OrdinalIgnoreCase))
            : null;

        var alertsText = p.Alerts != null && p.Alerts.Count > 0
            ? string.Join(", ", p.Alerts.Where(a => !a.IsDeleted && a.Status == PatientAlertStatus.Active).Select(a => a.Title))
            : null;
        if (string.IsNullOrWhiteSpace(alertsText)) alertsText = null;

        return new ClinicPatientDto(
            p.Id,
            p.TenantId,
            p.ClinicId,
            p.PatientCode,
            p.FirstName,
            p.LastName,
            p.MiddleName,
            p.Suffix,
            fullName,
            p.DateOfBirth,
            age,
            p.Sex.ToString(),
            p.CivilStatus?.ToString(),
            p.ContactNumber,
            p.Email,
            p.PhilHealthNumber,
            p.SeniorCitizenId,
            p.PwdId,
            p.BloodType?.ToString(),
            p.CreatedAt,
            p.CustomFields,
            p.VerificationStatus.ToString(),
            activeQueueTicket,
            activeQueueItemId,
            pastMedicalHistories,
            p.ClinicEzId,
            p.LandlineNumber,
            p.MaidenLastName,
            p.PreferredName,
            p.Nationality,
            p.Religion,
            p.IsDeceased,
            p.DeceasedAt,
            Allergies: allergiesText,
            ChronicConditions: chronicConditions,
            Alerts: alertsText,
            SyncPatientId: p.CloudPatientId,
            GenderIdentity: p.GenderIdentity);
    }

    public static BiologicalSex ParseBiologicalSex(string? sex)
    {
        if (string.IsNullOrWhiteSpace(sex))
        {
            return BiologicalSex.Male;
        }

        var candidate = sex.Trim();
        if (Enum.TryParse<BiologicalSex>(candidate, true, out var parsedSex))
        {
            return parsedSex;
        }

        return candidate.ToUpperInvariant() switch
        {
            "M" => BiologicalSex.Male,
            "F" => BiologicalSex.Female,
            "I" => BiologicalSex.Intersex,
            "U" or "OTHER" => BiologicalSex.Unknown,
            _ => BiologicalSex.Male
        };
    }

    public static CivilStatus? ParseCivilStatus(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        if (Enum.TryParse<CivilStatus>(trimmed, true, out var parsed))
        {
            return parsed;
        }

        return trimmed.ToUpperInvariant() switch
        {
            "COHABITING / COMMON-LAW" or "COHABITING" => CivilStatus.Cohabiting,
            "COMMON-LAW" or "COMMON LAW" => CivilStatus.CommonLaw,
            "OTHER CIVIL STATUS" or "OTHER_CIVIL_STATUS" => CivilStatus.Other,
            _ => null
        };
    }

    public static string? NormalizeGenderIdentity(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        return trimmed.Length <= 50 ? trimmed : trimmed[..50];
    }
}
