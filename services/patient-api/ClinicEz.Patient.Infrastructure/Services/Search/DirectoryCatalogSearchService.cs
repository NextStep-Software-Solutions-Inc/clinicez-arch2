using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Search;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Services.Search;

public sealed class DirectoryCatalogSearchService(
    ApplicationDbContext db,
    TimeProvider timeProvider) : IDirectoryCatalogSearchService
{
    public async Task<DirectorySearchResponseDto> SearchAsync(
        Guid? patientId,
        string? query,
        string category = "all",
        bool availableTodayOnly = false,
        bool openNowOnly = false,
        int takePerCategory = 20,
        CancellationToken ct = default)
    {
        HashSet<Guid> joinedClinicIds = [];
        HashSet<Guid> joinedOrgIds = [];

        if (patientId.HasValue)
        {
            var patientExists = await db.Patients.AsNoTracking().AnyAsync(p => p.Id == patientId.Value, ct);
            if (!patientExists)
                throw new NotFoundException($"Patient '{patientId.Value}' was not found.");

            joinedClinicIds = (await db.ClinicMemberships
                .AsNoTracking()
                .Where(m => m.PatientId == patientId.Value && m.Status == ClinicMembershipStatus.Active)
                .Select(m => m.ClinicId)
                .ToListAsync(ct)).ToHashSet();

            joinedOrgIds = (await db.OrganizationMemberships
                .AsNoTracking()
                .Where(m => m.PatientId == patientId.Value && m.Status == ClinicMembershipStatus.Active)
                .Select(m => m.OrganizationId)
                .ToListAsync(ct)).ToHashSet();
        }

        var normalizedQuery = (query ?? string.Empty).Trim();
        var normalizedCategory = string.IsNullOrWhiteSpace(category) ? "all" : category.Trim().ToLowerInvariant();
        var take = Math.Clamp(takePerCategory, 1, 50);
        var utcNow = timeProvider.GetUtcNow().UtcDateTime;

        IQueryable<Clinic> baseClinics = db.Clinics
            .AsNoTracking()
            .Include(c => c.OrganizationLinks)
            .Include(c => c.HealthcareProviders)
                .ThenInclude(p => p.Practitioner)
            .Include(c => c.HealthcareProviders)
                .ThenInclude(p => p.ProviderAvailabilities)
            .Include(c => c.Services);

        baseClinics = patientId.HasValue
            ? baseClinics.Where(c =>
                c.IsPublic ||
                joinedClinicIds.Contains(c.Id) ||
                c.OrganizationLinks.Any(l => l.IsActive && joinedOrgIds.Contains(l.OrganizationId)))
            : baseClinics.Where(c => c.IsPublic);

        var allClinics = await baseClinics
            .OrderByDescending(c => c.SupportsAppointments)
            .ThenByDescending(c => c.TenantId != null)
            .ThenByDescending(c => c.FeaturedScore)
            .ThenBy(c => c.Name)
            .ToListAsync(ct);

        // Build Doctors list (verified, opted-in Doctor/Nurse clinicians grouped by canonical PractitionerId)
        var eligibleEntries = new List<DoctorAffiliationCandidate>();
        for (var clinicRank = 0; clinicRank < allClinics.Count; clinicRank++)
        {
            var clinic = allClinics[clinicRank];
            var isClinicUnlocked = !clinic.IsGated || IsClinicUnlockedForPatient(clinic, joinedClinicIds, joinedOrgIds);

            foreach (var provider in clinic.HealthcareProviders
                .Where(IsEligibleDirectoryClinician)
                .OrderBy(p => p.DisplayOrder)
                .ThenBy(p => p.Name))
            {
                var practitioner = provider.Practitioner!;
                var matchesQuery = MatchesDoctor(provider, practitioner, clinic, normalizedQuery);
                var (nextSlot, nextLabel, availabilities) = ResolveScheduleSummary(
                    provider.ProviderAvailabilities,
                    clinic,
                    isClinicUnlocked,
                    utcNow);

                eligibleEntries.Add(new DoctorAffiliationCandidate(
                    clinic,
                    clinicRank,
                    provider,
                    practitioner,
                    isClinicUnlocked,
                    matchesQuery,
                    nextSlot,
                    nextLabel,
                    availabilities));
            }
        }

        var matchedDoctors = new List<DirectoryDoctorDto>();
        foreach (var group in eligibleEntries.GroupBy(e => e.Practitioner.Id))
        {
            if (!string.IsNullOrWhiteSpace(normalizedQuery) && !group.Any(e => e.MatchesQuery))
                continue;

            var candidates = availableTodayOnly
                ? group.Where(e => e.Clinic.SupportsAppointments && e.NextSlot.HasValue && e.NextSlot.Value.Date == utcNow.Date).ToList()
                : group.ToList();

            if (candidates.Count == 0)
                continue;

            var ordered = candidates
                .OrderByDescending(e => string.IsNullOrWhiteSpace(normalizedQuery) ? false : e.MatchesQuery)
                .ThenByDescending(e => e.Clinic.SupportsAppointments)
                .ThenByDescending(e => e.NextSlot.HasValue)
                .ThenBy(e => e.NextSlot ?? DateTime.MaxValue)
                .ThenBy(e => e.ClinicRank)
                .ThenBy(e => e.Provider.DisplayOrder)
                .ThenBy(e => e.Clinic.Name)
                .ToList();

            var primary = ordered[0];
            var practitioner = primary.Practitioner;
            var affiliations = ordered
                .Select(e => new DirectoryDoctorAffiliationDto(
                    e.Clinic.Id,
                    e.Clinic.Name,
                    e.Clinic.Address,
                    e.Clinic.SupportsAppointments,
                    ResolveAffiliationSpecialty(e.Provider, practitioner),
                    e.NextSlot,
                    e.NextLabel,
                    e.Availabilities,
                    e.Provider.Id))
                .ToList();

            var tags = BuildDoctorTags(primary.Provider, primary.Clinic, primary.IsClinicUnlocked, primary.NextSlot, utcNow);
            var role = PractitionerIdentity.NormalizeProfessionKind(primary.Provider.Role) ?? practitioner.ProfessionKind;
            var displayName = !string.IsNullOrWhiteSpace(practitioner.Name) ? practitioner.Name : primary.Provider.Name;
            var primarySpecialty = !string.IsNullOrWhiteSpace(primary.Provider.Specialty)
                ? primary.Provider.Specialty
                : practitioner.PrimarySpecialty;

            matchedDoctors.Add(new DirectoryDoctorDto(
                primary.Provider.Id,
                practitioner.Id,
                primary.Clinic.Id,
                displayName,
                primarySpecialty,
                role,
                primary.Provider.AvatarUrl ?? practitioner.AvatarUrl,
                !string.IsNullOrWhiteSpace(practitioner.DisplayPrcLicenseNo)
                    ? practitioner.DisplayPrcLicenseNo
                    : primary.Provider.ProfessionalLicenseNo,
                IsVerified: true,
                primary.Clinic.Name,
                primary.Clinic.Address,
                primary.Clinic.SupportsAppointments,
                primary.NextSlot,
                primary.NextLabel,
                tags,
                practitioner.Bio,
                affiliations));
        }

        matchedDoctors = matchedDoctors
            .OrderByDescending(d => d.ClinicSupportsAppointments)
            .ThenByDescending(d => d.NextAvailableAt.HasValue)
            .ThenBy(d => d.NextAvailableAt ?? DateTime.MaxValue)
            .ThenBy(d => d.Name)
            .ToList();

        // Build Clinics list (verified/public clinics, plus patient-joined; booking-paused clinics remain visible ranked after bookable)
        var matchedClinics = new List<DirectoryClinicDto>();
        foreach (var clinic in allClinics)
        {
            if (!MatchesClinic(clinic, normalizedQuery))
                continue;

            var specialties = ParseSpecialties(clinic.SpecialtiesJson);
            var (isOpenNow, openLabel) = ComputeClinicOpenStatus(clinic, utcNow);
            if (openNowOnly && !isOpenNow)
                continue;

            var earliestProviderSlot = clinic.SupportsAppointments
                ? clinic.HealthcareProviders
                    .Where(IsEligibleDirectoryClinician)
                    .Select(p => ComputeNextAvailableSlot(p.ProviderAvailabilities, utcNow))
                    .Where(s => s.Slot.HasValue)
                    .OrderBy(s => s.Slot)
                    .FirstOrDefault()
                : default;

            if (availableTodayOnly && (!earliestProviderSlot.Slot.HasValue || earliestProviderSlot.Slot.Value.Date != utcNow.Date))
                continue;

            var isUnlocked = !clinic.IsGated || IsClinicUnlockedForPatient(clinic, joinedClinicIds, joinedOrgIds);
            var tags = BuildClinicTags(clinic, specialties, isUnlocked);
            var nextSlot = clinic.SupportsAppointments ? earliestProviderSlot.Slot : null;
            var nextLabel = clinic.SupportsAppointments
                ? (earliestProviderSlot.Slot.HasValue ? earliestProviderSlot.Label : null)
                : "Booking Paused";

            matchedClinics.Add(new DirectoryClinicDto(
                clinic.Id,
                clinic.Name,
                specialties.FirstOrDefault()
                    ?? clinic.HealthcareProviders.FirstOrDefault(IsEligibleDirectoryClinician)?.Specialty
                    ?? "Multi-Specialty Care",
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
                nextSlot,
                nextLabel,
                tags,
                clinic.IsPlatformVerified));
        }

        // Build Services / Care Packages list
        var matchedServices = new List<DirectoryServiceDto>();
        foreach (var clinic in allClinics)
        {
            var isUnlocked = !clinic.IsGated || IsClinicUnlockedForPatient(clinic, joinedClinicIds, joinedOrgIds);
            if (!isUnlocked) continue; // Gated clinic services stay protected until unlocked

            foreach (var svc in clinic.Services.Where(s => s.IsActive).OrderBy(s => s.DisplayOrder).ThenBy(s => s.Name))
            {
                if (!MatchesService(svc, clinic, normalizedQuery))
                    continue;

                var priceBadge = FormatServicePriceBadge(svc.Price);
                var tags = BuildServiceTags(svc, clinic);
                matchedServices.Add(new DirectoryServiceDto(
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

        var counts = new DirectorySearchCountsDto(
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

        return new DirectorySearchResponseDto(
            normalizedQuery,
            normalizedCategory,
            counts,
            returnDoctors,
            returnClinics,
            returnServices);
    }

    public async Task<PractitionerProfileDto?> GetPractitionerProfileAsync(
        Guid id,
        Guid? patientId = null,
        CancellationToken ct = default)
    {
        HashSet<Guid> joinedClinicIds = [];
        HashSet<Guid> joinedOrgIds = [];

        if (patientId.HasValue)
        {
            var patientExists = await db.Patients.AsNoTracking().AnyAsync(p => p.Id == patientId.Value, ct);
            if (!patientExists)
                throw new NotFoundException($"Patient '{patientId.Value}' was not found.");

            joinedClinicIds = (await db.ClinicMemberships
                .AsNoTracking()
                .Where(m => m.PatientId == patientId.Value && m.Status == ClinicMembershipStatus.Active)
                .Select(m => m.ClinicId)
                .ToListAsync(ct)).ToHashSet();

            joinedOrgIds = (await db.OrganizationMemberships
                .AsNoTracking()
                .Where(m => m.PatientId == patientId.Value && m.Status == ClinicMembershipStatus.Active)
                .Select(m => m.OrganizationId)
                .ToListAsync(ct)).ToHashSet();
        }

        var practitioner = await ResolveVerifiedPractitionerAsync(id, ct);
        if (practitioner is null)
            return null;

        var utcNow = timeProvider.GetUtcNow().UtcDateTime;

        var rawProviders = await db.ClinicHealthcareProviders
            .AsNoTracking()
            .Include(p => p.Clinic)
                .ThenInclude(c => c.OrganizationLinks)
            .Include(p => p.ProviderAvailabilities)
            .Where(p =>
                p.PractitionerId == practitioner.Id &&
                p.IsActive &&
                p.IsDirectoryOptIn &&
                !p.HasIdentityConflict)
            .ToListAsync(ct);

        var visibleProviders = rawProviders
            .Where(p =>
                string.Equals(p.AffiliationStatus, "Active", StringComparison.OrdinalIgnoreCase) &&
                PractitionerIdentity.NormalizeProfessionKind(p.Role) is "Doctor" or "Nurse" &&
                (p.Clinic.IsPublic ||
                 (patientId.HasValue &&
                  (joinedClinicIds.Contains(p.ClinicId) ||
                   p.Clinic.OrganizationLinks.Any(l => l.IsActive && joinedOrgIds.Contains(l.OrganizationId))))))
            .Select(p =>
            {
                var isUnlocked = !p.Clinic.IsGated || IsClinicUnlockedForPatient(p.Clinic, joinedClinicIds, joinedOrgIds);
                var (nextSlot, nextLabel, availabilities) = ResolveScheduleSummary(
                    p.ProviderAvailabilities,
                    p.Clinic,
                    isUnlocked,
                    utcNow);

                return new
                {
                    Provider = p,
                    NextSlot = nextSlot,
                    NextLabel = nextLabel,
                    Availabilities = availabilities
                };
            })
            .OrderByDescending(x => x.Provider.Clinic.SupportsAppointments)
            .ThenByDescending(x => x.NextSlot.HasValue)
            .ThenBy(x => x.NextSlot ?? DateTime.MaxValue)
            .ThenByDescending(x => x.Provider.Clinic.TenantId != null)
            .ThenByDescending(x => x.Provider.Clinic.FeaturedScore)
            .ThenBy(x => x.Provider.Clinic.Name)
            .ToList();

        if (visibleProviders.Count == 0)
            return null;

        var affiliations = visibleProviders
            .Select(x => new DirectoryDoctorAffiliationDto(
                x.Provider.ClinicId,
                x.Provider.Clinic.Name,
                x.Provider.Clinic.Address,
                x.Provider.Clinic.SupportsAppointments,
                ResolveAffiliationSpecialty(x.Provider, practitioner),
                x.NextSlot,
                x.NextLabel,
                x.Availabilities,
                x.Provider.Id))
            .ToList();

        return new PractitionerProfileDto(
            practitioner.Id,
            practitioner.Id,
            practitioner.Name,
            practitioner.FirstName,
            practitioner.LastName,
            practitioner.ProfessionKind,
            practitioner.PrimarySpecialty,
            practitioner.Bio,
            practitioner.AvatarUrl ?? visibleProviders[0].Provider.AvatarUrl,
            practitioner.DisplayPrcLicenseNo,
            practitioner.PrcExpiryDate,
            practitioner.VerificationLevel,
            IsVerified: true,
            practitioner.VerifiedAtUtc,
            affiliations);
    }

    private async Task<Practitioner?> ResolveVerifiedPractitionerAsync(Guid id, CancellationToken ct)
    {
        var candidate = await db.Practitioners
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == id, ct);

        if (candidate is null)
        {
            var providerPractitionerId = await db.ClinicHealthcareProviders
                .AsNoTracking()
                .Where(p => p.Id == id && p.PractitionerId != null)
                .Select(p => p.PractitionerId)
                .FirstOrDefaultAsync(ct);

            if (providerPractitionerId.HasValue)
            {
                candidate = await db.Practitioners
                    .AsNoTracking()
                    .FirstOrDefaultAsync(p => p.Id == providerPractitionerId.Value, ct);
            }
        }

        if (candidate is null)
            return null;

        var visited = new HashSet<Guid> { candidate.Id };
        while (candidate.MergedIntoPractitionerId is { } mergedTargetId &&
               mergedTargetId != Guid.Empty &&
               visited.Add(mergedTargetId))
        {
            var target = await db.Practitioners
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.Id == mergedTargetId, ct);

            if (target is null)
                return null;

            candidate = target;
        }

        if (candidate.MergedIntoPractitionerId is not null ||
            candidate.VerificationLevel != PractitionerVerificationLevel.Verified)
        {
            return null;
        }

        return candidate;
    }

    private static bool IsEligibleDirectoryClinician(ClinicHealthcareProvider p)
    {
        if (!p.IsActive || !p.IsDirectoryOptIn || p.HasIdentityConflict)
            return false;

        if (!string.Equals(p.AffiliationStatus, "Active", StringComparison.OrdinalIgnoreCase))
            return false;

        var normalizedRole = PractitionerIdentity.NormalizeProfessionKind(p.Role);
        if (normalizedRole is not ("Doctor" or "Nurse"))
            return false;

        if (p.Practitioner is null || p.Practitioner.MergedIntoPractitionerId is not null)
            return false;

        return p.Practitioner.VerificationLevel == PractitionerVerificationLevel.Verified;
    }

    private static bool IsClinicUnlockedForPatient(
        Clinic clinic,
        HashSet<Guid> joinedClinicIds,
        HashSet<Guid> joinedOrgIds)
    {
        if (!clinic.IsGated)
            return true;

        if (joinedClinicIds.Contains(clinic.Id))
            return true;

        return clinic.OrganizationLinks.Any(l => l.IsActive && joinedOrgIds.Contains(l.OrganizationId));
    }

    private static (DateTime? NextSlot, string NextLabel, IReadOnlyList<ProviderAvailabilityWindowDto> Availabilities)
        ResolveScheduleSummary(
            ICollection<ProviderAvailability> availabilities,
            Clinic clinic,
            bool isClinicUnlocked,
            DateTime utcNow)
    {
        if (!isClinicUnlocked)
        {
            return (null, clinic.SupportsAppointments ? "Members Only" : "Booking Paused", []);
        }

        var windows = BuildAvailabilityWindows(availabilities);
        if (!clinic.SupportsAppointments)
        {
            return (null, "Booking Paused", windows);
        }

        var (nextSlot, nextLabel) = ComputeNextAvailableSlot(availabilities, utcNow);
        return (nextSlot, nextLabel, windows);
    }

    private static IReadOnlyList<ProviderAvailabilityWindowDto> BuildAvailabilityWindows(
        ICollection<ProviderAvailability> availabilities) =>
        availabilities
            .Where(a => a.IsActive && !a.IsDeleted)
            .OrderBy(a => a.DayOfWeek)
            .ThenBy(a => a.StartTime)
            .Select(a => new ProviderAvailabilityWindowDto(
                a.DayOfWeek,
                a.StartTime.ToString(@"hh\:mm", CultureInfo.InvariantCulture),
                a.EndTime.ToString(@"hh\:mm", CultureInfo.InvariantCulture)))
            .ToList();

    private static string ResolveAffiliationSpecialty(ClinicHealthcareProvider provider, Practitioner practitioner) =>
        !string.IsNullOrWhiteSpace(provider.Specialty) ? provider.Specialty : practitioner.PrimarySpecialty;

    private static bool MatchesDoctor(
        ClinicHealthcareProvider provider,
        Practitioner practitioner,
        Clinic clinic,
        string query)
    {
        if (string.IsNullOrWhiteSpace(query)) return true;
        return ContainsIgnoreCase(provider.Name, query)
               || ContainsIgnoreCase(practitioner.Name, query)
               || ContainsIgnoreCase(provider.Specialty, query)
               || ContainsIgnoreCase(practitioner.PrimarySpecialty, query)
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
               || clinic.HealthcareProviders.Any(p =>
                   IsEligibleDirectoryClinician(p) &&
                   (ContainsIgnoreCase(p.Specialty, query) || ContainsIgnoreCase(p.Name, query)));
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
            .Where(IsEligibleDirectoryClinician)
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

        return clinic.SupportsAppointments ? (true, "Open Network") : (false, "Booking Paused");
    }

    private static IReadOnlyList<string> BuildDoctorTags(
        ClinicHealthcareProvider provider,
        Clinic clinic,
        bool isClinicUnlocked,
        DateTime? nextSlot,
        DateTime utcNow)
    {
        var tags = new List<string>(2);
        if (!clinic.SupportsAppointments)
            tags.Add("Booking Paused");
        else if (clinic.IsPublic)
            tags.Add("Open Network");
        else if (isClinicUnlocked)
            tags.Add("Member Network");

        if (clinic.SupportsAppointments)
        {
            if (nextSlot.HasValue && (nextSlot.Value.Date - utcNow.Date).TotalDays <= 1)
                tags.Add("Next-Day Appt");
            else
                tags.Add("In-Person & Telehealth");
        }

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
        if (!clinic.SupportsAppointments)
            tags.Add("Booking Paused");
        else
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

    private sealed record DoctorAffiliationCandidate(
        Clinic Clinic,
        int ClinicRank,
        ClinicHealthcareProvider Provider,
        Practitioner Practitioner,
        bool IsClinicUnlocked,
        bool MatchesQuery,
        DateTime? NextSlot,
        string NextLabel,
        IReadOnlyList<ProviderAvailabilityWindowDto> Availabilities);
}

// ── Pluggable ISearchProvider Implementations (Shared Search Contract Parity) ─

public sealed class PatientDoctorSearchProvider(
    IDirectoryCatalogSearchService catalogSearch) : ISearchProvider
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
                ["practitionerId"] = d.PractitionerId?.ToString() ?? string.Empty,
            })).ToList();
    }
}

public sealed class PatientClinicSearchProvider(
    IDirectoryCatalogSearchService catalogSearch) : ISearchProvider
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
    IDirectoryCatalogSearchService catalogSearch) : ISearchProvider
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
