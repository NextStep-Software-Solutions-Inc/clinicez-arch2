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
    private readonly IRepository<ClinicPatient> _patientRepo;

    public GetClinicPatientCountsQueryHandler(IRepository<ClinicPatient> patientRepo)
    {
        _patientRepo = patientRepo;
    }

    public async Task<PatientDirectoryCountsDto> Handle(GetClinicPatientCountsQuery request, CancellationToken ct)
    {
        IQueryable<ClinicPatient> query = _patientRepo.Query().AsNoTracking();

        query = query.WhereMatchesSearchTerm(request.SearchTerm);

        var seniorCutoff = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-60));

        var allCount = await query.CountAsync(ct);

        var alertsCount = await query.Where(p =>
            (!string.IsNullOrWhiteSpace(p.Alerts) && p.Alerts.Trim().Length > 0) ||
            (!string.IsNullOrWhiteSpace(p.Allergies) && p.Allergies.Trim().Length > 0))
            .CountAsync(ct);

        var seniorPwdCount = await query.Where(p =>
            (!string.IsNullOrWhiteSpace(p.SeniorCitizenId) && p.SeniorCitizenId.Trim().Length > 0) ||
            (!string.IsNullOrWhiteSpace(p.PwdId) && p.PwdId.Trim().Length > 0) ||
            p.DateOfBirth <= seniorCutoff)
            .CountAsync(ct);

        int studentsCount;
        int employeesCount;

        try
        {
            studentsCount = await query.Where(p =>
                EF.Functions.ILike(EF.Property<string>(p, "CustomFields"), "%\"Student\"%") ||
                EF.Functions.ILike(EF.Property<string>(p, "CustomFields"), "%\"student_id\"%"))
                .CountAsync(ct);

            employeesCount = await query.Where(p =>
                EF.Functions.ILike(EF.Property<string>(p, "CustomFields"), "%\"Employee\"%") ||
                EF.Functions.ILike(EF.Property<string>(p, "CustomFields"), "%\"employee_id\"%"))
                .CountAsync(ct);
        }
        catch
        {
            // Fallback for InMemory EF provider and mock repositories
            var list = await query.Select(p => p.CustomFields).ToListAsync(ct);
            studentsCount = list.Count(cf =>
                cf != null && (
                    (cf.TryGetValue("classification", out var c) && string.Equals(c?.ToString(), "Student", StringComparison.OrdinalIgnoreCase)) ||
                    (cf.TryGetValue("category", out var cat) && string.Equals(cat?.ToString(), "Student", StringComparison.OrdinalIgnoreCase)) ||
                    cf.ContainsKey("student_id")
                ));
            employeesCount = list.Count(cf =>
                cf != null && (
                    (cf.TryGetValue("classification", out var c) && string.Equals(c?.ToString(), "Employee", StringComparison.OrdinalIgnoreCase)) ||
                    (cf.TryGetValue("category", out var cat) && string.Equals(cat?.ToString(), "Employee", StringComparison.OrdinalIgnoreCase)) ||
                    cf.ContainsKey("employee_id")
                ));
        }

        return new PatientDirectoryCountsDto(
            All: allCount,
            Students: studentsCount,
            Employees: employeesCount,
            Alerts: alertsCount,
            SeniorPwd: seniorPwdCount);
    }
}
