using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interfaces;
using ClinicEz.Shared.Search;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Services.Search;

public sealed class PatientCatalogSearchService(
    ApplicationDbContext db,
    TimeProvider timeProvider) : IPatientCatalogSearchService
{
    public async Task<PatientSearchResponseDto> SearchAsync(
        Guid patientId,
        string? query,
        string category = "all",
        bool availableTodayOnly = false,
        bool openNowOnly = false,
        int takePerCategory = 20,
        CancellationToken ct = default)
    {
        var patientExists = await db.Patients.AsNoTracking().AnyAsync(p => p.Id == patientId, ct);
        if (!patientExists)
            throw new NotFoundException($"Patient '{patientId}' was not found.");

        var normalizedQuery = (query ?? string.Empty).Trim();
        var normalizedCategory = string.IsNullOrWhiteSpace(category) ? "all" : category.Trim().ToLowerInvariant();
        var take = Math.Clamp(takePerCategory, 1, 50);
        var utcNow = timeProvider.GetUtcNow().UtcDateTime;

        var activeClinicMemberships = await db.ClinicMemberships
            .AsNoTracking()
            .Where(m => m.PatientId == patientId && m.Status == ClinicMembershipStatus.Active)
            .Select(m => m.ClinicId)
            .ToListAsync(ct);
        var joinedClinicIds = activeClinicMemberships.ToHashSet();

        var joinedOrgIds = (await db.OrganizationMemberships
            .AsNoTracking()
            .Where(m => m.PatientId == patientId && m.Status == ClinicMembershipStatus.Active)
            .Select(m => m.OrganizationId)
            .ToListAsync(ct)).ToHashSet();

        // Load visible clinics respecting two-tier governance (public OR joined clinic OR linked to joined org)
        var allClinics = await db.Clinics
            .AsNoTracking()
            .Include(c => c.OrganizationLinks)
            .Include(c => c.HealthcareProviders)
                .ThenInclude(p => p.ProviderAvailabilities)
            .Include(c => c.Services)
            .Where(c =>
                c.IsPublic ||
                joinedClinicIds.Contains(c.Id) ||
                c.OrganizationLinks.Any(l => l.IsActive && joinedOrgIds.Contains(l.OrganizationId)))
            .OrderByDescending(c => c.TenantId != null)
            .ThenByDescending(c => c.FeaturedScore)
            .ThenBy(c => c.Name)
            .ToListAsync(ct);

        // Build Doctors list
        var matchedDoctors = new List<PatientSearchDoctorDto>();
        foreach (var clinic in allClinics)
        {
            var isClinicUnlocked = !clinic.IsGated || joinedClinicIds.Contains(clinic.Id);
            foreach (var provider in clinic.HealthcareProviders.Where(p => p.IsActive).OrderBy(p => p.DisplayOrder).ThenBy(p => p.Name))
            {
                if (!MatchesDoctor(provider, clinic, normalizedQuery))
                    continue;

                var (nextSlot, nextLabel) = ComputeNextAvailableSlot(provider.ProviderAvailabilities, utcNow);
                if (availableTodayOnly && (!nextSlot.HasValue || nextSlot.Value.Date != utcNow.Date))
                    continue;

                var tags = BuildDoctorTags(provider, clinic, isClinicUnlocked, nextSlot, utcNow);
                matchedDoctors.Add(new PatientSearchDoctorDto(
                    provider.Id,
                    clinic.Id,
                    provider.Name,
                    provider.Specialty,
                    provider.AvatarUrl,
                    provider.ProfessionalLicenseNo,
                    !string.IsNullOrWhiteSpace(provider.ProfessionalLicenseNo),
                    clinic.Name,
                    clinic.Address,
                    clinic.SupportsAppointments,
                    nextSlot,
                    nextLabel,
                    tags));
            }
        }

        // Build Clinics list
        var matchedClinics = new List<PatientSearchClinicDto>();
        foreach (var clinic in allClinics)
        {
            if (!MatchesClinic(clinic, normalizedQuery))
                continue;

            var specialties = ParseSpecialties(clinic.SpecialtiesJson);
            var (isOpenNow, openLabel) = ComputeClinicOpenStatus(clinic, utcNow);
            if (openNowOnly && !isOpenNow)
                continue;

            var earliestProviderSlot = clinic.HealthcareProviders
                .Where(p => p.IsActive)
                .Select(p => ComputeNextAvailableSlot(p.ProviderAvailabilities, utcNow))
                .Where(s => s.Slot.HasValue)
                .OrderBy(s => s.Slot)
                .FirstOrDefault();

            if (availableTodayOnly && (!earliestProviderSlot.Slot.HasValue || earliestProviderSlot.Slot.Value.Date != utcNow.Date))
                continue;

            var isUnlocked = !clinic.IsGated || joinedClinicIds.Contains(clinic.Id);
            var tags = BuildClinicTags(clinic, specialties, isUnlocked);

            matchedClinics.Add(new PatientSearchClinicDto(
                clinic.Id,
                clinic.Name,
                specialties.FirstOrDefault() ?? clinic.HealthcareProviders.FirstOrDefault(p => p.IsActive)?.Specialty ?? "Multi-Specialty Care",
                clinic.Description,
                clinic.Address,
                clinic.LogoUrl,
                clinic.CoverImageUrl,
                clinic.OperatingHours,
                openLabel,
                isOpenNow,
                clinic.SupportsAppointments,
                clinic.IsPublic,
                clinic.IsGated,
                isUnlocked,
                clinic.ActiveMemberCount,
                earliestProviderSlot.Slot,
                earliestProviderSlot.Slot.HasValue ? earliestProviderSlot.Label : null,
                tags));
        }

        // Build Services / Care Packages list
        var matchedServices = new List<PatientSearchServiceDto>();
        foreach (var clinic in allClinics)
        {
            var isUnlocked = !clinic.IsGated || joinedClinicIds.Contains(clinic.Id);
            if (!isUnlocked) continue; // Gated clinic services stay protected until unlocked

            foreach (var svc in clinic.Services.Where(s => s.IsActive).OrderBy(s => s.DisplayOrder).ThenBy(s => s.Name))
            {
                if (!MatchesService(svc, clinic, normalizedQuery))
                    continue;

                var priceBadge = FormatServicePriceBadge(svc.Price);
                var tags = BuildServiceTags(svc, clinic);
                matchedServices.Add(new PatientSearchServiceDto(
                    svc.Id,
                    clinic.Id,
                    clinic.Name,
                    svc.Name,
                    clinic.Name,
                    svc.Description,
                    svc.DurationMinutes,
                    svc.Price,
                    priceBadge,
                    tags));
            }
        }

        var counts = new PatientSearchCountsDto(
            matchedDoctors.Count + matchedClinics.Count + matchedServices.Count,
            matchedDoctors.Count,
            matchedClinics.Count,
            matchedServices.Count);

        var returnDoctors = normalizedCategory is "all" or "doctors"
            ? matchedDoctors.Take(take).ToList()
            : [];
        var returnClinics = normalizedCategory is "all" or "clinics"
            ? matchedClinics.Take(take).ToList()
            : [];
        var returnServices = normalizedCategory is "all" or "services"
            ? matchedServices.Take(take).ToList()
            : [];

        return new PatientSearchResponseDto(
            normalizedQuery,
            normalizedCategory,
            counts,
            returnDoctors,
            returnClinics,
            returnServices);
    }

    private static bool MatchesDoctor(ClinicHealthcareProvider provider, Clinic clinic, string query)
    {
        if (string.IsNullOrWhiteSpace(query)) return true;
        return ContainsIgnoreCase(provider.Name, query)
               || ContainsIgnoreCase(provider.Specialty, query)
               || ContainsIgnoreCase(clinic.Name, query)
               || ContainsIgnoreCase(clinic.Address, query);
    }

    private static bool MatchesClinic(Clinic clinic, string query)
    {
        if (string.IsNullOrWhiteSpace(query)) return true;
        return ContainsIgnoreCase(clinic.Name, query)
               || ContainsIgnoreCase(clinic.Description, query)
               || ContainsIgnoreCase(clinic.Address, query)
               || ContainsIgnoreCase(clinic.SpecialtiesJson, query)
               || clinic.HealthcareProviders.Any(p => p.IsActive && (ContainsIgnoreCase(p.Specialty, query) || ContainsIgnoreCase(p.Name, query)));
    }

    private static bool MatchesService(ClinicService service, Clinic clinic, string query)
    {
        if (string.IsNullOrWhiteSpace(query)) return true;
        return ContainsIgnoreCase(service.Name, query)
               || ContainsIgnoreCase(service.Description, query)
               || ContainsIgnoreCase(clinic.Name, query)
               || ContainsIgnoreCase(clinic.SpecialtiesJson, query);
    }

    private static bool ContainsIgnoreCase(string? haystack, string needle)
        => !string.IsNullOrWhiteSpace(haystack) && haystack.Contains(needle, StringComparison.OrdinalIgnoreCase);

    private static (DateTime? Slot, string Label) ComputeNextAvailableSlot(
        ICollection<ProviderAvailability> availabilities,
        DateTime utcNow)
    {
        var active = availabilities.Where(a => a.IsActive && !a.IsDeleted).ToList();
        if (active.Count == 0)
            return (null, "Online Request");

        for (var dayOffset = 0; dayOffset <= 7; dayOffset++)
        {
            var candidateDate = utcNow.Date.AddDays(dayOffset);
            var dayMatches = active
                .Where(a => a.DayOfWeek == candidateDate.DayOfWeek)
                .OrderBy(a => a.StartTime)
                .ToList();

            foreach (var window in dayMatches)
            {
                var slotStart = candidateDate.Add(window.StartTime);
                if (dayOffset == 0 && slotStart <= utcNow.AddMinutes(30))
                {
                    var roundedHour = utcNow.Minute < 30
                        ? new TimeSpan(utcNow.Hour, 30, 0)
                        : new TimeSpan(utcNow.Hour + 1, 0, 0);
                    if (roundedHour < window.EndTime && roundedHour >= window.StartTime)
                    {
                        var todaySlot = DateTime.SpecifyKind(candidateDate.Add(roundedHour), DateTimeKind.Utc);
                        return (todaySlot, $"Today, {todaySlot.ToString("h:mm tt", CultureInfo.InvariantCulture)}");
                    }
                    continue;
                }

                var resolved = DateTime.SpecifyKind(slotStart, DateTimeKind.Utc);
                var timePart = resolved.ToString("h:mm tt", CultureInfo.InvariantCulture);
                var label = dayOffset switch
                {
                    0 => $"Today, {timePart}",
                    1 => $"Tomorrow, {timePart}",
                    _ => resolved.ToString("ddd, MMM d", CultureInfo.InvariantCulture)
                };
                return (resolved, label);
            }
        }

        return (null, "Schedule Open");
    }

    private static (bool IsOpenNow, string Label) ComputeClinicOpenStatus(Clinic clinic, DateTime utcNow)
    {
        var anyTodayAvailability = clinic.HealthcareProviders
            .Where(p => p.IsActive)
            .SelectMany(p => p.ProviderAvailabilities)
            .Where(a => a.IsActive && !a.IsDeleted && a.DayOfWeek == utcNow.DayOfWeek)
            .ToList();

        if (anyTodayAvailability.Count > 0)
        {
            var nowTime = utcNow.TimeOfDay;
            var openRightNow = anyTodayAvailability.Any(a => nowTime >= a.StartTime && nowTime <= a.EndTime);
            return openRightNow ? (true, "Open Now") : (false, "Open Today");
        }

        if (!string.IsNullOrWhiteSpace(clinic.OperatingHours))
        {
            if (clinic.OperatingHours.Contains("24", StringComparison.OrdinalIgnoreCase))
                return (true, "Open 24/7");
            return (true, "Open Today");
        }

        return clinic.SupportsAppointments ? (true, "Open Network") : (false, "Directory Listed");
    }

    private static IReadOnlyList<string> BuildDoctorTags(
        ClinicHealthcareProvider provider,
        Clinic clinic,
        bool isClinicUnlocked,
        DateTime? nextSlot,
        DateTime utcNow)
    {
        var tags = new List<string>(2);
        if (clinic.IsPublic)
            tags.Add("Open Network");
        else if (isClinicUnlocked)
            tags.Add("Member Network");

        if (nextSlot.HasValue && (nextSlot.Value.Date - utcNow.Date).TotalDays <= 1)
            tags.Add("Next-Day Appt");
        else if (clinic.SupportsAppointments)
            tags.Add("In-Person & Telehealth");

        if (tags.Count < 2 && !string.IsNullOrWhiteSpace(provider.Specialty))
            tags.Add(provider.Specialty);

        return tags.Take(2).ToList();
    }

    private static IReadOnlyList<string> BuildClinicTags(
        Clinic clinic,
        IReadOnlyList<string> specialties,
        bool isUnlocked)
    {
        var tags = new List<string>(2);
        if (clinic.SupportsAppointments)
            tags.Add("Walk-ins & Booking");
        if (specialties.Count > 0)
            tags.Add(specialties[0]);
        else if (isUnlocked && clinic.IsGated)
            tags.Add("Member Access");
        else if (clinic.IsPublic)
            tags.Add("Open Network");

        return tags.Take(2).ToList();
    }

    private static IReadOnlyList<string> BuildServiceTags(ClinicService service, Clinic clinic)
    {
        var tags = new List<string>(2);
        if (service.Price is null or <= 0m)
            tags.Add("Network Benefit");
        else
            tags.Add("Transparent Pricing");

        if (service.DurationMinutes.HasValue)
            tags.Add($"{service.DurationMinutes.Value} Min Session");
        else if (clinic.SupportsAppointments)
            tags.Add("Online Scheduling");

        return tags.Take(2).ToList();
    }

    private static string FormatServicePriceBadge(decimal? price)
    {
        if (!price.HasValue || price.Value <= 0m)
            return "Covered";
        return $"PHP {price.Value.ToString("N0", CultureInfo.InvariantCulture)}";
    }

    private static IReadOnlyList<string> ParseSpecialties(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            var list = JsonSerializer.Deserialize<List<string>>(json);
            return list?.Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s.Trim()).ToList() ?? [];
        }
        catch
        {
            return [];
        }
    }
}

// ── Pluggable ISearchProvider Implementations (Shared Search Contract Parity) ─

public sealed class PatientDoctorSearchProvider(
    IPatientCatalogSearchService catalogSearch) : ISearchProvider
{
    public string Category => "Doctors";
    public int Priority => 10;
    public string? RequiredPermission => null;

    public async Task<IReadOnlyList<SearchResultItemDto>> SearchAsync(
        string query,
        Guid tenantId,
        int limit,
        CancellationToken ct)
    {
        if (tenantId == Guid.Empty)
            return Array.Empty<SearchResultItemDto>();

        var res = await catalogSearch.SearchAsync(tenantId, query, "doctors", takePerCategory: limit, ct: ct);
        return res.Doctors.Select(d => new SearchResultItemDto(
            id: d.Id.ToString(),
            category: Category,
            title: d.Name,
            subtitle: $"{d.Specialty} • {d.ClinicName}",
            badgeText: d.NextAvailableLabel,
            badgeVariant: SearchBadgeVariant.Routine,
            targetRoute: "BookingDraftScreen",
            routeParams: new Dictionary<string, string>
            {
                ["clinicId"] = d.ClinicId.ToString(),
                ["providerId"] = d.Id.ToString(),
            })).ToList();
    }
}

public sealed class PatientClinicSearchProvider(
    IPatientCatalogSearchService catalogSearch) : ISearchProvider
{
    public string Category => "Clinics";
    public int Priority => 20;
    public string? RequiredPermission => null;

    public async Task<IReadOnlyList<SearchResultItemDto>> SearchAsync(
        string query,
        Guid tenantId,
        int limit,
        CancellationToken ct)
    {
        if (tenantId == Guid.Empty)
            return Array.Empty<SearchResultItemDto>();

        var res = await catalogSearch.SearchAsync(tenantId, query, "clinics", takePerCategory: limit, ct: ct);
        return res.Clinics.Select(c => new SearchResultItemDto(
            id: c.Id.ToString(),
            category: Category,
            title: c.Name,
            subtitle: c.Address ?? c.PrimarySpecialty ?? "Partner Clinic",
            badgeText: c.OpenStatusLabel,
            badgeVariant: c.IsOpenNow ? SearchBadgeVariant.Routine : SearchBadgeVariant.Neutral,
            targetRoute: "ClinicDetailsScreen",
            routeParams: new Dictionary<string, string>
            {
                ["clinicId"] = c.Id.ToString(),
            })).ToList();
    }
}

public sealed class PatientServiceSearchProvider(
    IPatientCatalogSearchService catalogSearch) : ISearchProvider
{
    public string Category => "Services";
    public int Priority => 30;
    public string? RequiredPermission => null;

    public async Task<IReadOnlyList<SearchResultItemDto>> SearchAsync(
        string query,
        Guid tenantId,
        int limit,
        CancellationToken ct)
    {
        if (tenantId == Guid.Empty)
            return Array.Empty<SearchResultItemDto>();

        var res = await catalogSearch.SearchAsync(tenantId, query, "services", takePerCategory: limit, ct: ct);
        return res.Services.Select(s => new SearchResultItemDto(
            id: s.Id.ToString(),
            category: Category,
            title: s.Name,
            subtitle: $"{s.ClinicName}{(s.DurationMinutes.HasValue ? $" • {s.DurationMinutes.Value} mins" : string.Empty)}",
            badgeText: s.PriceBadgeLabel,
            badgeVariant: SearchBadgeVariant.Routine,
            targetRoute: "BookingDraftScreen",
            routeParams: new Dictionary<string, string>
            {
                ["clinicId"] = s.ClinicId.ToString(),
                ["serviceId"] = s.Id.ToString(),
            })).ToList();
    }
}
