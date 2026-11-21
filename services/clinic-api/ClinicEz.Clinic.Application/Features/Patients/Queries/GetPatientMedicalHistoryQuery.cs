using System;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;

public sealed record GetPatientMedicalHistoryQuery(Guid PatientId) : IRequest<PatientMedicalHistoryResultDto>;

public sealed class GetPatientMedicalHistoryQueryHandler : IRequestHandler<GetPatientMedicalHistoryQuery, PatientMedicalHistoryResultDto>
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<PatientMedicalHistory> _medicalRepo;

    public GetPatientMedicalHistoryQueryHandler(
        IRepository<Patient> patientRepo,
        IRepository<PatientMedicalHistory> medicalRepo)
    {
        _patientRepo = patientRepo;
        _medicalRepo = medicalRepo;
    }

    public async Task<PatientMedicalHistoryResultDto> Handle(GetPatientMedicalHistoryQuery request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepo.Query(p => p.Id == request.PatientId)
            .FirstOrDefaultAsync(cancellationToken);

        if (patient == null)
        {
            throw new NotFoundException($"Patient with id {request.PatientId} not found.");
        }

        var entries = await _medicalRepo.Query(m => m.PatientId == request.PatientId && m.Category == MedicalHistoryCategory.MedicalHistory)
            .OrderBy(m => m.ConditionTitle)
            .ToListAsync(cancellationToken);

        var dtos = entries.Select(e => new PatientPastMedicalHistoryDto(
            e.Id,
            e.PatientId,
            e.ConditionTitle,
            e.PhilHealthMdiseaseCode,
            e.Icd10Code,
            e.SpecificDescription,
            e.OnsetDate,
            e.Status == ProblemStatus.Resolved,
            e.ClinicalNotes,
            e.UpdatedAt ?? e.CreatedAt)).ToList();

        string? savedNotes = ReadCustomString(patient, "personal_medical_history_notes");
        DateTime? customUpdatedAt = ReadCustomTimestamp(patient, "personal_medical_history_updated_at");
        DateTime? maxItemUpdated = entries.Count > 0 ? entries.Max(e => e.UpdatedAt ?? e.CreatedAt) : null;
        DateTime? resolvedUpdatedAt = customUpdatedAt.HasValue && maxItemUpdated.HasValue
            ? (customUpdatedAt.Value > maxItemUpdated.Value ? customUpdatedAt : maxItemUpdated)
            : (customUpdatedAt ?? maxItemUpdated);

        return new PatientMedicalHistoryResultDto(
            dtos,
            string.IsNullOrWhiteSpace(savedNotes) ? null : savedNotes,
            resolvedUpdatedAt);
    }

    private static string? ReadCustomString(Patient patient, string key)
    {
        if (patient.CustomFields == null || !patient.CustomFields.TryGetValue(key, out var raw) || raw == null)
        {
            return null;
        }
        if (raw is JsonElement je)
        {
            return je.ValueKind == JsonValueKind.Null ? null : je.ToString();
        }
        return raw.ToString();
    }

    private static DateTime? ReadCustomTimestamp(Patient patient, string key)
    {
        var raw = ReadCustomString(patient, key);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }
        return DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed)
            ? parsed
            : null;
    }
}
