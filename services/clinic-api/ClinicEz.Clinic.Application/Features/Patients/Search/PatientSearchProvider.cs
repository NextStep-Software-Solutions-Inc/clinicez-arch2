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
    private readonly IRepository<ClinicPatient> _patientRepo;

    public string Category => "Patients";
    public int Priority => 10;
    public string? RequiredPermission => ClinicPermissions.PatientsRead;

    public PatientSearchProvider(IRepository<ClinicPatient> patientRepo)
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

        var term = query.Trim().ToLowerInvariant();
        var boundedLimit = limit <= 0 ? 10 : Math.Min(limit, 50);

        var patients = await _patientRepo.Query(e => !e.IsDeleted && e.ClinicId == tenantId, ignoreQueryFilters: true)
            .AsNoTracking()
            .Where(p =>
                p.FirstName.ToLower().Contains(term) ||
                p.LastName.ToLower().Contains(term) ||
                (p.MiddleName != null && p.MiddleName.ToLower().Contains(term)) ||
                p.PatientCode.ToLower().Contains(term) ||
                p.ContactNumber.Contains(term) ||
                (p.PhilHealthNumber != null && p.PhilHealthNumber.Contains(term)) ||
                (p.SeniorCitizenId != null && p.SeniorCitizenId.Contains(term)) ||
                (p.PwdId != null && p.PwdId.Contains(term)))
            .OrderBy(p => p.LastName)
            .ThenBy(p => p.FirstName)
            .Take(boundedLimit)
            .ToListAsync(ct);

        return patients.Select(p =>
        {
            var (badgeText, badgeVariant) = ResolveBadge(p);
            var fullName = string.IsNullOrWhiteSpace(p.MiddleName)
                ? $"{p.LastName}, {p.FirstName}"
                : $"{p.LastName}, {p.FirstName} {p.MiddleName}";

            return new SearchResultItemDto(
                id: p.Id.ToString(),
                category: Category,
                title: fullName,
                subtitle: $"{p.PatientCode} • DOB: {p.DateOfBirth:yyyy-MM-dd} • {p.ContactNumber}",
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

    private static (string text, string variant) ResolveBadge(ClinicPatient patient)
    {
        if (!string.IsNullOrWhiteSpace(patient.Alerts))
            return ("Alert", SearchBadgeVariant.Emergency);

        if (!string.IsNullOrWhiteSpace(patient.SeniorCitizenId))
            return ("Senior", SearchBadgeVariant.Neutral);

        if (!string.IsNullOrWhiteSpace(patient.PwdId))
            return ("PWD", SearchBadgeVariant.Neutral);

        return (patient.Gender ?? "Routine", SearchBadgeVariant.Routine);
    }
}
