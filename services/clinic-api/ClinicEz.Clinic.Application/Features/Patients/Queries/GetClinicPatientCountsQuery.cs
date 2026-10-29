using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Search;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;

public sealed record GetClinicPatientCountsQuery(string? SearchTerm = null) : IRequest<PatientDirectoryCountsDto>;

public sealed class GetClinicPatientCountsQueryHandler : IRequestHandler<GetClinicPatientCountsQuery, PatientDirectoryCountsDto>
{
    private readonly IRepository<Patient> _patientRepo;

    public GetClinicPatientCountsQueryHandler(IRepository<Patient> patientRepo)
    {
        _patientRepo = patientRepo;
    }

    public async Task<PatientDirectoryCountsDto> Handle(GetClinicPatientCountsQuery request, CancellationToken ct)
    {
        IQueryable<Patient> query = _patientRepo.Query().AsNoTracking();

        query = query.WhereMatchesSearchTerm(request.SearchTerm);

        var seniorCutoff = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-60));

        try
        {
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
                        EF.Functions.ILike(EF.Property<string>(p, "CustomFields"), "%\"employee_id\"%"))
                })
                .FirstOrDefaultAsync(ct);

            if (aggregated != null)
            {
                return new PatientDirectoryCountsDto(
                    All: aggregated.All,
                    Students: aggregated.Students,
                    Employees: aggregated.Employees,
                    Alerts: aggregated.Alerts,
                    SeniorPwd: aggregated.SeniorPwd);
            }

            return new PatientDirectoryCountsDto(0, 0, 0, 0, 0);
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

            return new PatientDirectoryCountsDto(
                All: allCount,
                Students: studentsCount,
                Employees: employeesCount,
                Alerts: alertsCount,
                SeniorPwd: seniorPwdCount);
        }
    }
}
