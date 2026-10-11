using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Allergies.Dtos;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

public sealed record RegisterClinicPatientCommand(
    string FirstName,
    string LastName,
    string? MiddleName,
    string? Suffix,
    DateOnly DateOfBirth,
    string Gender,
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
    Guid? SyncPatientId = null,
    System.Collections.Generic.Dictionary<string, object?>? CustomFields = null,
    string VerificationStatus = "Verified",
    List<CreateAllergyRequest>? StructuredAllergies = null,
    bool SendToTriage = false,
    string? Priority = "Normal",
    string? ChiefComplaint = null) : IRequest<ClinicPatientDto>;

public sealed class RegisterClinicPatientCommandHandler : IRequestHandler<RegisterClinicPatientCommand, ClinicPatientDto>
{
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<PatientAllergy>? _allergyRepo;
    private readonly IRepository<QueueItem>? _queueRepo;

    public RegisterClinicPatientCommandHandler(
        IRepository<ClinicPatient> patientRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<PatientAllergy>? allergyRepo = null,
        IRepository<QueueItem>? queueRepo = null)
    {
        _patientRepo = patientRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _allergyRepo = allergyRepo;
        _queueRepo = queueRepo;
    }

    public async Task<ClinicPatientDto> Handle(RegisterClinicPatientCommand request, CancellationToken ct)
    {
        var year = DateTime.UtcNow.Year;
        var count = await _patientRepo.Query()
            .CountAsync(p => p.CreatedAt.Year == year, ct);

        var patientCode = $"PAT-{year}-{(count + 1):D5}";

        var patient = new ClinicPatient
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
            Gender = string.IsNullOrWhiteSpace(request.Gender) ? "Male" : request.Gender,
            CivilStatus = request.CivilStatus,
            ContactNumber = request.ContactNumber.Trim(),
            Email = request.Email?.Trim(),
            AddressLine = request.AddressLine?.Trim(),
            Barangay = request.Barangay?.Trim(),
            City = request.City?.Trim(),
            Province = request.Province?.Trim(),
            EmergencyContactName = request.EmergencyContactName?.Trim(),
            EmergencyContactPhone = request.EmergencyContactPhone?.Trim(),
            EmergencyContactRelationship = request.EmergencyContactRelationship?.Trim(),
            PhilHealthNumber = request.PhilHealthNumber?.Trim(),
            SeniorCitizenId = request.SeniorCitizenId?.Trim(),
            PwdId = request.PwdId?.Trim(),
            BloodType = request.BloodType?.Trim(),
            Allergies = request.Allergies?.Trim(),
            ChronicConditions = request.ChronicConditions?.Trim(),
            Alerts = request.Alerts?.Trim(),
            SyncPatientId = request.SyncPatientId,
            CustomFields = request.CustomFields ?? new System.Collections.Generic.Dictionary<string, object?>(),
            VerificationStatus = string.IsNullOrWhiteSpace(request.VerificationStatus) ? "Verified" : request.VerificationStatus,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicStaff"
        };

        await _patientRepo.AddAsync(patient, ct);

        // 1. Ingest Structured Allergies
        if (request.StructuredAllergies != null && request.StructuredAllergies.Count > 0 && _allergyRepo != null)
        {
            var recordedAllergens = new List<string>();

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

                await _allergyRepo.AddAsync(allergy, ct);
                recordedAllergens.Add(allergy.Allergen);
            }

            // Keep patient.Allergies summary string updated in sync
            if (recordedAllergens.Count > 0)
            {
                var summary = string.Join(", ", recordedAllergens);
                if (string.IsNullOrWhiteSpace(patient.Allergies))
                {
                    patient.Allergies = summary;
                }
                else
                {
                    patient.Allergies = $"{patient.Allergies}, {summary}";
                }
            }
        }

        // 2. 1-Click "Send to Triage" Flow
        QueueItem? queueItem = null;
        if (request.SendToTriage && _queueRepo != null)
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
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
                CreatedAt = DateTime.UtcNow,
                CreatedBy = _clinicContext.StaffId?.ToString() ?? "FrontDesk"
            };

            await _queueRepo.AddAsync(queueItem, ct);
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return MapToDto(patient, queueItem?.QueueNumber, queueItem?.Id);
    }

    public static ClinicPatientDto MapToDto(ClinicPatient p) => MapToDto(p, null, null);

    public static ClinicPatientDto MapToDto(ClinicPatient p, string? activeQueueTicket, Guid? activeQueueItemId)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var age = today.Year - p.DateOfBirth.Year;
        if (p.DateOfBirth > today.AddYears(-age)) age--;

        var middleInitial = !string.IsNullOrWhiteSpace(p.MiddleName) ? $" {p.MiddleName[0]}." : "";
        var suffix = !string.IsNullOrWhiteSpace(p.Suffix) ? $" {p.Suffix}" : "";
        var fullName = $"{p.LastName}, {p.FirstName}{middleInitial}{suffix}";

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
            p.Gender,
            p.CivilStatus,
            p.ContactNumber,
            p.Email,
            p.AddressLine,
            p.Barangay,
            p.City,
            p.Province,
            p.EmergencyContactName,
            p.EmergencyContactPhone,
            p.EmergencyContactRelationship,
            p.PhilHealthNumber,
            p.SeniorCitizenId,
            p.PwdId,
            p.BloodType,
            p.Allergies,
            p.ChronicConditions,
            p.Alerts,
            p.SyncPatientId,
            p.CreatedAt,
            p.CustomFields,
            p.VerificationStatus,
            activeQueueTicket,
            activeQueueItemId);
    }
}
