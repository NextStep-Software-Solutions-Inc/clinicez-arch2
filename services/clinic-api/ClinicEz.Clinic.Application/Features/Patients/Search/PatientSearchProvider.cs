using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Search;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Search;

/// <summary>
/// Pluggable search provider querying patient records by name, PhilHealth PIN, patient code, DOB, and contact.
/// </summary>
public sealed class PatientSearchProvider : ISearchProvider
{
    private readonly IRepository<Patient> _patientRepo;

    public string Category => "Patients";
    public int Priority => 10;
    public string? RequiredPermission => ClinicPermissions.PatientsRead;

    public PatientSearchProvider(IRepository<Patient> patientRepo)
    {
        _patientRepo = patientRepo ?? throw new ArgumentNullException(nameof(patientRepo));
    }

    public async Task<IReadOnlyList<SearchResultItemDto>> SearchAsync(
        string query,
        Guid tenantId,
        int limit,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(query))
            return Array.Empty<SearchResultItemDto>();

        var boundedLimit = limit <= 0 ? 10 : Math.Min(limit, 50);

        var patients = await _patientRepo.Query(e => !e.IsDeleted && e.ClinicId == tenantId, ignoreQueryFilters: true)
            .Include(p => p.Alerts)
            .AsNoTracking()
            .WhereMatchesSearchTerm(query)
            .OrderBy(p => p.LastName)
            .ThenBy(p => p.FirstName)
            .Take(boundedLimit)
            .ToListAsync(ct);

        return patients.Select(p =>
        {
            var (badgeText, badgeVariant) = ResolveBadge(p);
            var middle = !string.IsNullOrWhiteSpace(p.MiddleName) ? $" {p.MiddleName.Trim()}" : "";
            var suffix = !string.IsNullOrWhiteSpace(p.Suffix) ? $" {p.Suffix.Trim()}" : "";
            var title = $"{p.LastName}, {p.FirstName}{middle}{suffix}";

            var subtitle = string.IsNullOrWhiteSpace(p.ClinicEzId)
                ? $"{p.PatientCode} • DOB: {p.DateOfBirth:yyyy-MM-dd} • {p.ContactNumber}"
                : $"{p.PatientCode} • {p.ClinicEzId} • DOB: {p.DateOfBirth:yyyy-MM-dd} • {p.ContactNumber}";

            return new SearchResultItemDto(
                id: p.Id.ToString(),
                category: Category,
                title: title,
                subtitle: subtitle,
                badgeText: badgeText,
                badgeVariant: badgeVariant,
                targetRoute: "Patients",
                routeParams: new Dictionary<string, string>
                {
                    { "patientId", p.Id.ToString() }
                }
            );
        }).ToList();
    }

    private static (string text, string variant) ResolveBadge(Patient patient)
    {
        if (patient.Alerts.Any(a => a.IsActive))
            return ("Alert", SearchBadgeVariant.Emergency);

        if (!string.IsNullOrWhiteSpace(patient.SeniorCitizenId))
            return ("Senior", SearchBadgeVariant.Neutral);

        if (!string.IsNullOrWhiteSpace(patient.PwdId))
            return ("PWD", SearchBadgeVariant.Neutral);

        return (patient.Gender.ToString(), SearchBadgeVariant.Routine);
    }
}
