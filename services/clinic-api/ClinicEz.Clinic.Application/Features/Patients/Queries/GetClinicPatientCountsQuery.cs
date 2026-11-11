using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Search;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;

public sealed record GetClinicPatientCountsQuery(
    string? SearchTerm = null,
    Guid? StaffId = null,
    Guid? DoctorId = null,
    IReadOnlyList<Guid>? RoomIds = null) : IRequest<PatientDirectoryCountsDto>;

public sealed class GetClinicPatientCountsQueryHandler : IRequestHandler<GetClinicPatientCountsQuery, PatientDirectoryCountsDto>
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<QueueItem>? _queueRepo;
    private readonly IRepository<ConsultationEncounter>? _encounterRepo;

    public GetClinicPatientCountsQueryHandler(
        IRepository<Patient> patientRepo,
        IRepository<QueueItem>? queueRepo = null,
        IRepository<ConsultationEncounter>? encounterRepo = null)
    {
        _patientRepo = patientRepo;
        _queueRepo = queueRepo;
        _encounterRepo = encounterRepo;
    }

    public async Task<PatientDirectoryCountsDto> Handle(GetClinicPatientCountsQuery request, CancellationToken ct)
    {
        IQueryable<Patient> baseQuery = _patientRepo.Query().AsNoTracking();

        baseQuery = baseQuery.WhereMatchesSearchTerm(request.SearchTerm);

        var seniorCutoff = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-60));
        var effectiveStaffId = request.StaffId ?? request.DoctorId;

        var relatedPatientIds = new List<Guid>();
        if (effectiveStaffId.HasValue)
        {
            var staffId = effectiveStaffId.Value;
            var queuePatientIds = _queueRepo != null
                ? await _queueRepo.Query()
                    .AsNoTracking()
                    .Where(q => (q.DoctorId == staffId || (request.RoomIds != null && q.RoomId.HasValue && request.RoomIds.Contains(q.RoomId.Value))) &&
                                q.Status != QueueStatus.Completed &&
                                q.Status != QueueStatus.Cancelled &&
                                q.Status != QueueStatus.NoShow &&
                                q.Status != QueueStatus.DischargedNonDoctor &&
                                q.Status != QueueStatus.Diverted)
                    .Select(q => q.PatientId)
                    .Distinct()
                    .ToListAsync(ct)
                : new List<Guid>();

            var encounterPatientIds = _encounterRepo != null
                ? await _encounterRepo.Query()
                    .AsNoTracking()
                    .Where(e => e.DoctorId == staffId)
                    .Select(e => e.PatientId)
                    .Distinct()
                    .ToListAsync(ct)
                : new List<Guid>();

            relatedPatientIds = queuePatientIds.Concat(encounterPatientIds).Distinct().ToList();
        }

        try
        {
            var aggregated = await BuildPostgresCountsQuery(baseQuery, seniorCutoff, effectiveStaffId, relatedPatientIds)
                .FirstOrDefaultAsync(ct);

            if (aggregated != null)
            {
                return aggregated;
            }

            return new PatientDirectoryCountsDto(0, 0, 0, 0, 0, 0);
        }
        catch
        {
            // In-memory fallback for EF InMemory provider and mock repositories in unit tests
            var allCount = await baseQuery.CountAsync(ct);

            var alertsCount = await baseQuery.Where(p =>
                p.HasActiveSafetyAlert ||
                p.Alerts.Any(a => !a.IsDeleted && a.Status == PatientAlertStatus.Active) ||
                p.Allergies!.Any(a => !a.IsDeleted && a.Status == AllergyStatus.Active))
                .CountAsync(ct);

            var seniorPwdCount = await baseQuery.Where(p =>
                (!string.IsNullOrWhiteSpace(p.SeniorCitizenId) && p.SeniorCitizenId.Trim().Length > 0) ||
                (!string.IsNullOrWhiteSpace(p.PwdId) && p.PwdId.Trim().Length > 0) ||
                p.DateOfBirth <= seniorCutoff)
                .CountAsync(ct);

            var list = await baseQuery.Select(p => p.CustomFields).ToListAsync(ct);

            var studentsCount = list.Count(GetClinicPatientsQueryHandler.IsStudentCustomFields);
            var employeesCount = list.Count(GetClinicPatientsQueryHandler.IsEmployeeCustomFields);

            var myPatientsCount = 0;
            if (effectiveStaffId.HasValue)
            {
                var staffId = effectiveStaffId.Value;
                var staffIdStr = staffId.ToString();

                var patientVitalsAndCustom = await baseQuery
                    .Select(p => new
                    {
                        p.Id,
                        HasNurseVitals = p.Vitals.Any(v => !v.IsDeleted && v.NurseId == staffId),
                        p.CustomFields
                    })
                    .ToListAsync(ct);

                myPatientsCount = patientVitalsAndCustom.Count(p =>
                    (relatedPatientIds.Count > 0 && relatedPatientIds.Contains(p.Id)) ||
                    p.HasNurseVitals ||
                    GetClinicPatientsQueryHandler.IsStaffAssignedCustomFields(p.CustomFields, staffIdStr));
            }

            return new PatientDirectoryCountsDto(
                All: allCount,
                Students: studentsCount,
                Employees: employeesCount,
                Alerts: alertsCount,
                SeniorPwd: seniorPwdCount,
                MyPatients: myPatientsCount);
        }
    }

    public static IQueryable<PatientDirectoryCountsDto> BuildPostgresCountsQuery(
        IQueryable<Patient> baseQuery,
        DateOnly seniorCutoff,
        Guid? effectiveStaffId,
        IReadOnlyList<Guid> relatedPatientIds)
    {
        var staffId = effectiveStaffId ?? Guid.Empty;
        var staffIdStr = effectiveStaffId?.ToString() ?? string.Empty;
        var hasStaff = effectiveStaffId.HasValue;
        var assignedDoctorJson = $"{{\"assigned_doctor_id\":\"{staffIdStr}\"}}";
        var doctorJson = $"{{\"doctor_id\":\"{staffIdStr}\"}}";
        var nurseJson = $"{{\"nurse_id\":\"{staffIdStr}\"}}";
        var assignedNurseJson = $"{{\"assigned_nurse_id\":\"{staffIdStr}\"}}";

        // 10M-scale single-pass conditional aggregation + native JSONB @> / ? operators
        return baseQuery
            .GroupBy(_ => 1)
            .Select(g => new PatientDirectoryCountsDto(
                g.Count(),
                g.Count(p =>
                    EF.Functions.JsonContains(p.CustomFields, "{\"classification\":\"Student\"}") ||
                    EF.Functions.JsonContains(p.CustomFields, "{\"classification\":\"student\"}") ||
                    EF.Functions.JsonContains(p.CustomFields, "{\"classification\":\"STUDENT\"}") ||
                    EF.Functions.JsonContains(p.CustomFields, "{\"category\":\"Student\"}") ||
                    EF.Functions.JsonContains(p.CustomFields, "{\"category\":\"student\"}") ||
                    EF.Functions.JsonContains(p.CustomFields, "{\"category\":\"STUDENT\"}") ||
                    (EF.Functions.JsonExists(p.CustomFields, "student_id") &&
                     !EF.Functions.JsonContains(p.CustomFields, "{\"student_id\":\"\"}") &&
                     !EF.Functions.JsonContains(p.CustomFields, "{\"student_id\":null}"))),
                g.Count(p =>
                    EF.Functions.JsonContains(p.CustomFields, "{\"classification\":\"Employee\"}") ||
                    EF.Functions.JsonContains(p.CustomFields, "{\"classification\":\"employee\"}") ||
                    EF.Functions.JsonContains(p.CustomFields, "{\"classification\":\"EMPLOYEE\"}") ||
                    EF.Functions.JsonContains(p.CustomFields, "{\"category\":\"Employee\"}") ||
                    EF.Functions.JsonContains(p.CustomFields, "{\"category\":\"employee\"}") ||
                    EF.Functions.JsonContains(p.CustomFields, "{\"category\":\"EMPLOYEE\"}") ||
                    (EF.Functions.JsonExists(p.CustomFields, "employee_id") &&
                     !EF.Functions.JsonContains(p.CustomFields, "{\"employee_id\":\"\"}") &&
                     !EF.Functions.JsonContains(p.CustomFields, "{\"employee_id\":null}"))),
                g.Count(p =>
                    p.HasActiveSafetyAlert ||
                    p.Alerts.Any(a => !a.IsDeleted && a.Status == PatientAlertStatus.Active) ||
                    p.Allergies!.Any(a => !a.IsDeleted && a.Status == AllergyStatus.Active)),
                g.Count(p =>
                    (!string.IsNullOrWhiteSpace(p.SeniorCitizenId) && p.SeniorCitizenId.Trim().Length > 0) ||
                    (!string.IsNullOrWhiteSpace(p.PwdId) && p.PwdId.Trim().Length > 0) ||
                    p.DateOfBirth <= seniorCutoff),
                !hasStaff ? 0 : g.Count(p =>
                    (relatedPatientIds.Count > 0 && relatedPatientIds.Contains(p.Id)) ||
                    p.Vitals.Any(v => !v.IsDeleted && v.NurseId == staffId) ||
                    EF.Functions.JsonContains(p.CustomFields, assignedDoctorJson) ||
                    EF.Functions.JsonContains(p.CustomFields, doctorJson) ||
                    EF.Functions.JsonContains(p.CustomFields, nurseJson) ||
                    EF.Functions.JsonContains(p.CustomFields, assignedNurseJson))));
    }
}

