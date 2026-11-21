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

namespace ClinicEz.Clinic.Application.Features.Settings.Search;

/// <summary>
/// Pluggable search provider querying clinic rooms, service items, staff roster, and facility configurations.
/// Deep-links directly to target Settings screen tabs (general, services, staff, philhealth, license).
/// </summary>
public sealed class SettingSearchProvider : ISearchProvider
{
    private readonly IRepository<Room> _roomRepo;
    private readonly IRepository<ServiceItem> _serviceRepo;
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IRepository<FacilitySettings> _settingsRepo;

    public string Category => "Settings";
    public int Priority => 70;
    public string? RequiredPermission => ClinicPermissions.SettingsRead;

    public SettingSearchProvider(
        IRepository<Room> roomRepo,
        IRepository<ServiceItem> serviceRepo,
        IRepository<StaffMember> staffRepo,
        IRepository<FacilitySettings> settingsRepo)
    {
        _roomRepo = roomRepo ?? throw new ArgumentNullException(nameof(roomRepo));
        _serviceRepo = serviceRepo ?? throw new ArgumentNullException(nameof(serviceRepo));
        _staffRepo = staffRepo ?? throw new ArgumentNullException(nameof(staffRepo));
        _settingsRepo = settingsRepo ?? throw new ArgumentNullException(nameof(settingsRepo));
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
        var subLimit = Math.Max(2, limit / 4);

        // Partition queries across the 4 settings-related entity sets concurrently
        var roomsTask = SearchRoomsAsync(term, tenantId, subLimit, ct);
        var servicesTask = SearchServicesAsync(term, tenantId, subLimit, ct);
        var staffTask = SearchStaffAsync(term, tenantId, subLimit, ct);
        var settingsTask = SearchFacilitySettingsAsync(term, tenantId, subLimit, ct);

        await Task.WhenAll(roomsTask, servicesTask, staffTask, settingsTask);

        var results = new List<SearchResultItemDto>();
        results.AddRange(roomsTask.Result);
        results.AddRange(servicesTask.Result);
        results.AddRange(staffTask.Result);
        results.AddRange(settingsTask.Result);

        return results.Take(Math.Max(limit, 10)).ToList();
    }

    private async Task<List<SearchResultItemDto>> SearchRoomsAsync(
        string term,
        Guid tenantId,
        int subLimit,
        CancellationToken ct)
    {
        var rooms = await _roomRepo.Query(e => !e.IsDeleted && e.ClinicId == tenantId, ignoreQueryFilters: true)
            .AsNoTracking()
            .Where(r =>
                r.Name.ToLower().Contains(term) ||
                (r.Code != null && r.Code.ToLower().Contains(term)) ||
                (r.Description != null && r.Description.ToLower().Contains(term)) ||
                (term.Contains("room") && r.IsActive))
            .OrderBy(r => r.DisplayOrder)
            .Take(subLimit)
            .ToListAsync(ct);

        return rooms.Select(r => new SearchResultItemDto(
            id: r.Id.ToString(),
            category: Category,
            title: r.Name,
            subtitle: $"Room • Code: {r.Code ?? "N/A"} • Type: {r.Type}",
            badgeText: "Room",
            badgeVariant: SearchBadgeVariant.Neutral,
            targetRoute: "Settings",
            routeParams: new Dictionary<string, string>
            {
                { "tab", "general" },
                { "subtab", "rooms" },
                { "roomId", r.Id.ToString() }
            }
        )).ToList();
    }

    private async Task<List<SearchResultItemDto>> SearchServicesAsync(
        string term,
        Guid tenantId,
        int subLimit,
        CancellationToken ct)
    {
        var services = await _serviceRepo.Query(e => !e.IsDeleted && e.ClinicId == tenantId, ignoreQueryFilters: true)
            .AsNoTracking()
            .Where(s =>
                s.Name.ToLower().Contains(term) ||
                s.Code.ToLower().Contains(term) ||
                s.Category.ToLower().Contains(term) ||
                (s.Description != null && s.Description.ToLower().Contains(term)) ||
                (term.Contains("fee") || term.Contains("service") || term.Contains("catalog")))
            .OrderBy(s => s.Name)
            .Take(subLimit)
            .ToListAsync(ct);

        return services.Select(s => new SearchResultItemDto(
            id: s.Id.ToString(),
            category: Category,
            title: s.Name,
            subtitle: $"Service • Code: {s.Code} • Cat: {s.Category} • ₱{s.StandardPrice:N2}",
            badgeText: "Service",
            badgeVariant: SearchBadgeVariant.Neutral,
            targetRoute: "Settings",
            routeParams: new Dictionary<string, string>
            {
                { "tab", "services" },
                { "serviceId", s.Id.ToString() }
            }
        )).ToList();
    }

    private async Task<List<SearchResultItemDto>> SearchStaffAsync(
        string term,
        Guid tenantId,
        int subLimit,
        CancellationToken ct)
    {
        var staffList = await _staffRepo.Query(e => !e.IsDeleted && e.ClinicId == tenantId, ignoreQueryFilters: true)
            .AsNoTracking()
            .Where(s =>
                s.FirstName.ToLower().Contains(term) ||
                s.LastName.ToLower().Contains(term) ||
                (s.Title != null && s.Title.ToLower().Contains(term)) ||
                (s.Specialty != null && s.Specialty.ToLower().Contains(term)) ||
                (s.Email != null && s.Email.ToLower().Contains(term)) ||
                (term.Contains("doctor") || term.Contains("nurse") || term.Contains("staff") || term.Contains("roster")))
            .OrderBy(s => s.LastName)
            .ThenBy(s => s.FirstName)
            .Take(subLimit)
            .ToListAsync(ct);

        return staffList.Select(s => new SearchResultItemDto(
            id: s.Id.ToString(),
            category: Category,
            title: string.IsNullOrWhiteSpace(s.Title) ? $"{s.LastName}, {s.FirstName}" : $"{s.LastName}, {s.FirstName} ({s.Title})",
            subtitle: $"Staff • {s.Role}{(string.IsNullOrWhiteSpace(s.Specialty) ? "" : " • " + s.Specialty)} • {s.Email ?? s.PhoneNumber ?? "Active"}",
            badgeText: s.Role.ToString(),
            badgeVariant: SearchBadgeVariant.Neutral,
            targetRoute: "Settings",
            routeParams: new Dictionary<string, string>
            {
                { "tab", "staff" },
                { "staffId", s.Id.ToString() }
            }
        )).ToList();
    }

    private async Task<List<SearchResultItemDto>> SearchFacilitySettingsAsync(
        string term,
        Guid tenantId,
        int subLimit,
        CancellationToken ct)
    {
        var results = new List<SearchResultItemDto>();

        var settings = await _settingsRepo.Query(e => !e.IsDeleted && e.ClinicId == tenantId, ignoreQueryFilters: true)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        if (settings == null)
            return results;

        // 1. Clinic Facility Info
        if (settings.ClinicName.ToLower().Contains(term) || term.Contains("clinic") || term.Contains("facility"))
        {
            results.Add(new SearchResultItemDto(
                id: $"{settings.Id}:general",
                category: Category,
                title: settings.ClinicName,
                subtitle: $"Facility Information • Tier: {settings.PlanTier} • Slot: {settings.DefaultSlotDurationMinutes}m",
                badgeText: "Facility",
                badgeVariant: SearchBadgeVariant.Neutral,
                targetRoute: "Settings",
                routeParams: new Dictionary<string, string> { { "tab", "general" } }
            ));
        }

        // 2. Operating Hours
        if (!string.IsNullOrWhiteSpace(settings.OperatingHours) &&
            (settings.OperatingHours.ToLower().Contains(term) || term.Contains("hour") || term.Contains("schedule") || term.Contains("open")))
        {
            results.Add(new SearchResultItemDto(
                id: $"{settings.Id}:hours",
                category: Category,
                title: $"{settings.ClinicName} - Operating Hours",
                subtitle: settings.OperatingHours,
                badgeText: "Hours",
                badgeVariant: SearchBadgeVariant.Neutral,
                targetRoute: "Settings",
                routeParams: new Dictionary<string, string> { { "tab", "general" } }
            ));
        }

        // 3. PhilHealth Accreditation
        if (term.Contains("philhealth") || term.Contains("accreditation") || term.Contains("pmcc") ||
            (settings.AccreditationNumber != null && settings.AccreditationNumber.ToLower().Contains(term)) ||
            (settings.PmccNumber != null && settings.PmccNumber.ToLower().Contains(term)))
        {
            results.Add(new SearchResultItemDto(
                id: $"{settings.Id}:philhealth",
                category: Category,
                title: $"{settings.ClinicName} - PhilHealth Accreditation",
                subtitle: $"Accreditation: {settings.AccreditationNumber ?? "Pending"} • PMCC: {settings.PmccNumber ?? "Pending"}",
                badgeText: "PhilHealth",
                badgeVariant: SearchBadgeVariant.Neutral,
                targetRoute: "Settings",
                routeParams: new Dictionary<string, string> { { "tab", "philhealth" } }
            ));
        }

        // 4. Licensing & Entitlements
        if (term.Contains("license") || term.Contains("tier") || term.Contains("entitlement") || term.Contains("plan"))
        {
            results.Add(new SearchResultItemDto(
                id: $"{settings.Id}:license",
                category: Category,
                title: $"{settings.ClinicName} - License & Entitlements",
                subtitle: $"Tier: {settings.PlanTier} • Max Staff: {settings.MaxStaffLimit}",
                badgeText: "License",
                badgeVariant: SearchBadgeVariant.Neutral,
                targetRoute: "Settings",
                routeParams: new Dictionary<string, string> { { "tab", "license" } }
            ));
        }

        return results.Take(subLimit).ToList();
    }
}
