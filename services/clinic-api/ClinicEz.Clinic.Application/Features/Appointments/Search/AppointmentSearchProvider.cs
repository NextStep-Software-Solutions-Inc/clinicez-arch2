using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Search;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Appointments.Search;

/// <summary>
/// Pluggable search provider querying appointments by patient name, doctor name, service type, and reason.
/// </summary>
public sealed class AppointmentSearchProvider : ISearchProvider
{
    private readonly IRepository<Appointment> _appointmentRepo;

    public string Category => "Appointments";
    public int Priority => 30;
    public string? RequiredPermission => ClinicPermissions.AppointmentsRead;

    public AppointmentSearchProvider(IRepository<Appointment> appointmentRepo)
    {
        _appointmentRepo = appointmentRepo ?? throw new ArgumentNullException(nameof(appointmentRepo));
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

        var appointments = await _appointmentRepo.Query(e => !e.IsDeleted && e.ClinicId == tenantId, ignoreQueryFilters: true)
            .AsNoTracking()
            .Where(a =>
                a.PatientName.ToLower().Contains(term) ||
                (a.DoctorName != null && a.DoctorName.ToLower().Contains(term)) ||
                (a.ServiceType != null && a.ServiceType.ToLower().Contains(term)) ||
                (a.Reason != null && a.Reason.ToLower().Contains(term)) ||
                (a.Notes != null && a.Notes.ToLower().Contains(term)))
            .OrderByDescending(a => a.ScheduledAt)
            .Take(boundedLimit)
            .ToListAsync(ct);

        return appointments.Select(a =>
        {
            var (badgeText, badgeVariant) = ResolveBadge(a.Status);
            var reasonSnippet = string.IsNullOrWhiteSpace(a.Reason)
                ? string.Empty
                : " • " + a.Reason;

            return new SearchResultItemDto(
                id: a.Id.ToString(),
                category: Category,
                title: $"{a.PatientName} ({a.ServiceType ?? "General Visit"})",
                subtitle: $"{a.DoctorName ?? "Unassigned"} • {a.ScheduledAt:yyyy-MM-dd HH:mm}{reasonSnippet}",
                badgeText: badgeText,
                badgeVariant: badgeVariant,
                targetRoute: "Appointments",
                routeParams: new Dictionary<string, string>
                {
                    { "appointmentId", a.Id.ToString() }
                }
            );
        }).ToList();
    }

    private static (string text, string variant) ResolveBadge(AppointmentStatus status) =>
        status switch
        {
            AppointmentStatus.CheckedIn or AppointmentStatus.InConsultation => ("Active", SearchBadgeVariant.Urgent),
            AppointmentStatus.Completed => ("Completed", SearchBadgeVariant.Routine),
            AppointmentStatus.Cancelled => ("Cancelled", SearchBadgeVariant.Neutral),
            _ => (status.ToString(), SearchBadgeVariant.Routine)
        };
}
