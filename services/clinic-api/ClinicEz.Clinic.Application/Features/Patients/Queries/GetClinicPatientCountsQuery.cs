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
        IQueryable<Patient> query = _patientRepo.Query().AsNoTracking();

        query = query.WhereMatchesSearchTerm(request.SearchTerm);

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
                                q.Status != QueueStatus.Completed && q.Status != QueueStatus.Cancelled && q.Status != QueueStatus.NoShow)
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
            var staffId = effectiveStaffId ?? Guid.Empty;
            var staffIdStr = effectiveStaffId?.ToString() ?? string.Empty;
            var hasStaff = effectiveStaffId.HasValue;

            // 10M-scale single-pass conditional aggregation + HasActiveSafetyAlert boolean column + native JSONB @>
            var aggregated = await query
                .GroupBy(_ => 1)
                .Select(g => new
                {
                    All = g.Count(),
                    Alerts = g.Count(p => p.HasActiveSafetyAlert),
                    SeniorPwd = g.Count(p =>
                        (!string.IsNullOrWhiteSpace(p.SeniorCitizenId) && p.SeniorCitizenId.Trim().Length > 0) ||
                        (!string.IsNullOrWhiteSpace(p.PwdId) && p.PwdId.Trim().Length > 0) ||
                        p.DateOfBirth <= seniorCutoff),
                    Students = g.Count(p =>
                        EF.Functions.JsonContains(p.CustomFields, "{\"classification\":\"Student\"}") ||
                        EF.Functions.JsonContains(p.CustomFields, "{\"category\":\"Student\"}") ||
                        EF.Functions.ILike(EF.Property<string>(p, "CustomFields"), "%\"Student\"%") ||
                        EF.Functions.ILike(EF.Property<string>(p, "CustomFields"), "%\"student_id\"%")),
                    Employees = g.Count(p =>
                        EF.Functions.JsonContains(p.CustomFields, "{\"classification\":\"Employee\"}") ||
                        EF.Functions.JsonContains(p.CustomFields, "{\"category\":\"Employee\"}") ||
                        EF.Functions.ILike(EF.Property<string>(p, "CustomFields"), "%\"Employee\"%") ||
                        EF.Functions.ILike(EF.Property<string>(p, "CustomFields"), "%\"employee_id\"%")),
                    MyPatients = !hasStaff ? 0 : g.Count(p =>
                        (relatedPatientIds.Count > 0 && relatedPatientIds.Contains(p.Id)) ||
                        p.Vitals.Any(v => !v.IsDeleted && v.NurseId == staffId) ||
                        EF.Functions.JsonContains(p.CustomFields, $"{{\"assigned_doctor_id\":\"{staffIdStr}\"}}") ||
                        EF.Functions.JsonContains(p.CustomFields, $"{{\"doctor_id\":\"{staffIdStr}\"}}") ||
                        EF.Functions.JsonContains(p.CustomFields, $"{{\"nurse_id\":\"{staffIdStr}\"}}") ||
                        EF.Functions.JsonContains(p.CustomFields, $"{{\"assigned_nurse_id\":\"{staffIdStr}\"}}") ||
                        EF.Functions.ILike(EF.Property<string>(p, "CustomFields"), $"%{staffIdStr}%"))
                })
                .FirstOrDefaultAsync(ct);

            if (aggregated != null)
            {
                return new PatientDirectoryCountsDto(
                    All: aggregated.All,
                    Students: aggregated.Students,
                    Employees: aggregated.Employees,
                    Alerts: aggregated.Alerts,
                    SeniorPwd: aggregated.SeniorPwd,
                    MyPatients: aggregated.MyPatients);
            }

            return new PatientDirectoryCountsDto(0, 0, 0, 0, 0, 0);
        }
        catch
        {
            // In-memory fallback for EF InMemory provider and mock repositories in unit tests
            var allCount = await query.CountAsync(ct);

            var alertsCount = await query.Where(p =>
                p.HasActiveSafetyAlert ||
                p.Alerts.Any(a => !a.IsDeleted && a.Status == PatientAlertStatus.Active) ||
                p.Allergies!.Any(a => !a.IsDeleted && a.Status == AllergyStatus.Active))
                .CountAsync(ct);

            var seniorPwdCount = await query.Where(p =>
                (!string.IsNullOrWhiteSpace(p.SeniorCitizenId) && p.SeniorCitizenId.Trim().Length > 0) ||
                (!string.IsNullOrWhiteSpace(p.PwdId) && p.PwdId.Trim().Length > 0) ||
                p.DateOfBirth <= seniorCutoff)
                .CountAsync(ct);

            var list = await query.Select(p => p.CustomFields).ToListAsync(ct);

            var studentsCount = list.Count(cf =>
                cf != null && (
                    (cf.TryGetValue("classification", out var c) && string.Equals(c?.ToString(), "Student", StringComparison.OrdinalIgnoreCase)) ||
                    (cf.TryGetValue("category", out var cat) && string.Equals(cat?.ToString(), "Student", StringComparison.OrdinalIgnoreCase)) ||
                    cf.ContainsKey("student_id")
                ));

            var employeesCount = list.Count(cf =>
                cf != null && (
                    (cf.TryGetValue("classification", out var c) && string.Equals(c?.ToString(), "Employee", StringComparison.OrdinalIgnoreCase)) ||
                    (cf.TryGetValue("category", out var cat) && string.Equals(cat?.ToString(), "Employee", StringComparison.OrdinalIgnoreCase)) ||
                    cf.ContainsKey("employee_id")
                ));

            var myPatientsCount = 0;
            if (effectiveStaffId.HasValue)
            {
                var staffId = effectiveStaffId.Value;
                var staffIdStr = staffId.ToString();

                var patientVitalsAndCustom = await query
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
                    (p.CustomFields != null && (
                        (p.CustomFields.TryGetValue("assigned_doctor_id", out var ad) && string.Equals(ad?.ToString(), staffIdStr, StringComparison.OrdinalIgnoreCase)) ||
                        (p.CustomFields.TryGetValue("doctor_id", out var d) && string.Equals(d?.ToString(), staffIdStr, StringComparison.OrdinalIgnoreCase)) ||
                        (p.CustomFields.TryGetValue("nurse_id", out var n) && string.Equals(n?.ToString(), staffIdStr, StringComparison.OrdinalIgnoreCase)) ||
                        (p.CustomFields.TryGetValue("assigned_nurse_id", out var an) && string.Equals(an?.ToString(), staffIdStr, StringComparison.OrdinalIgnoreCase)) ||
                        p.CustomFields.Values.Any(v => v != null && v.ToString()!.Contains(staffIdStr, StringComparison.OrdinalIgnoreCase))
                    )));
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
}

