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

namespace ClinicEz.Clinic.Application.Features.Consultations.Search;

/// <summary>
/// Pluggable search provider querying consultation encounters by SOAP notes, diagnoses, patient name, and doctor name.
/// </summary>
public sealed class ConsultationSearchProvider : ISearchProvider
{
    private readonly IRepository<ConsultationEncounter> _consultationRepo;

    public string Category => "Consultations";
    public int Priority => 20;
    public string? RequiredPermission => ClinicPermissions.ConsultationsRead;

    public ConsultationSearchProvider(IRepository<ConsultationEncounter> consultationRepo)
    {
        _consultationRepo = consultationRepo ?? throw new ArgumentNullException(nameof(consultationRepo));
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

        var encounters = await _consultationRepo.Query(e => !e.IsDeleted && e.ClinicId == tenantId, ignoreQueryFilters: true)
            .AsNoTracking()
            .Where(c =>
                c.PatientName.ToLower().Contains(term) ||
                c.DoctorName.ToLower().Contains(term) ||
                c.Subjective.ToLower().Contains(term) ||
                c.Assessment.ToLower().Contains(term) ||
                c.Objective.ToLower().Contains(term) ||
                c.Plan.ToLower().Contains(term) ||
                (c.PhilHealthOtherComplaint != null && c.PhilHealthOtherComplaint.ToLower().Contains(term)) ||
                (c.PhilHealthCaseNo != null && c.PhilHealthCaseNo.ToLower().Contains(term)) ||
                (c.HciCaseNo != null && c.HciCaseNo.ToLower().Contains(term)))
            .OrderByDescending(c => c.EncounterDate)
            .Take(boundedLimit)
            .ToListAsync(ct);

        return encounters.Select(c =>
        {
            var badgeText = c.IsSigned ? "Signed" : "In Progress";
            var badgeVariant = c.IsSigned ? SearchBadgeVariant.Routine : SearchBadgeVariant.Urgent;

            var titleSnippet = string.IsNullOrWhiteSpace(c.Subjective)
                ? "Consultation"
                : (c.Subjective.Length > 30 ? c.Subjective.Substring(0, 27) + "..." : c.Subjective);

            var assessmentSnippet = string.IsNullOrWhiteSpace(c.Assessment)
                ? string.Empty
                : " • " + (c.Assessment.Length > 40 ? c.Assessment.Substring(0, 37) + "..." : c.Assessment);

            return new SearchResultItemDto(
                id: c.Id.ToString(),
                category: Category,
                title: $"{c.PatientName} - {titleSnippet}",
                subtitle: $"{c.DoctorName} • {c.EncounterDate:yyyy-MM-dd HH:mm}{assessmentSnippet}",
                badgeText: badgeText,
                badgeVariant: badgeVariant,
                targetRoute: "Consultations",
                routeParams: new Dictionary<string, string>
                {
                    { "consultationId", c.Id.ToString() }
                }
            );
        }).ToList();
    }
}
