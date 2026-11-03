using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Interfaces;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Discovery.Queries.UnifiedSearch;

public sealed record UnifiedSearchQuery(
    string? Query,
    string? Type = null,
    int Skip = 0,
    int Take = 20) : IRequest<UnifiedSearchResultDto>;

public sealed class UnifiedSearchQueryHandler : IRequestHandler<UnifiedSearchQuery, UnifiedSearchResultDto>
{
    private readonly IClinicRepository _clinicRepository;

    public UnifiedSearchQueryHandler(IClinicRepository clinicRepository)
    {
        _clinicRepository = clinicRepository;
    }

    public async Task<UnifiedSearchResultDto> Handle(
        UnifiedSearchQuery request, CancellationToken cancellationToken)
    {
        var typeFilter = request.Type?.Trim().ToLowerInvariant();
        var q = request.Query?.Trim();

        var doctorsList = new List<UnifiedDoctorDto>();
        var clinicsList = new List<UnifiedClinicDto>();
        var servicesList = new List<UnifiedServiceDto>();

        var shouldSearchDoctors = string.IsNullOrEmpty(typeFilter) || typeFilter == "all" || typeFilter == "doctors";
        var shouldSearchClinics = string.IsNullOrEmpty(typeFilter) || typeFilter == "all" || typeFilter == "clinics";
        var shouldSearchServices = string.IsNullOrEmpty(typeFilter) || typeFilter == "all" || typeFilter == "services";

        if (shouldSearchDoctors)
        {
            var providers = await _clinicRepository.SearchProvidersAsync(q, request.Skip, request.Take, cancellationToken);
            foreach (var p in providers)
            {
                var rating = p.Clinic?.FeaturedScore > 0
                    ? Math.Min(5.0m, 4.5m + (p.Clinic.FeaturedScore % 5) * 0.1m)
                    : 4.9m;
                var reviewsCount = p.Clinic?.ActiveMemberCount > 0 ? p.Clinic.ActiveMemberCount : 128;

                doctorsList.Add(new UnifiedDoctorDto(
                    p.Id,
                    p.Name,
                    p.Specialty,
                    p.Clinic?.Name ?? "ClinicEZ Center",
                    "1.2 km away",
                    rating,
                    reviewsCount,
                    "Tomorrow, 10:30 AM",
                    new List<string> { "Accepts Insurance", "In-Person & Telehealth" }
                ));
            }
        }

        if (shouldSearchClinics)
        {
            var clinics = await _clinicRepository.SearchAsync(q, request.Skip, request.Take, cancellationToken);
            foreach (var c in clinics)
            {
                var rating = c.FeaturedScore > 0
                    ? Math.Min(5.0m, 4.4m + (c.FeaturedScore % 6) * 0.1m)
                    : 4.8m;
                var reviewsCount = c.ActiveMemberCount > 0 ? c.ActiveMemberCount : 94;
                var openText = !string.IsNullOrWhiteSpace(c.OperatingHours)
                    ? c.OperatingHours
                    : "Open Today • Closes 6:00 PM";

                clinicsList.Add(new UnifiedClinicDto(
                    c.Id,
                    c.Name,
                    c.Address,
                    "1.2 km away",
                    true,
                    openText,
                    rating,
                    reviewsCount,
                    new List<string> { "Echo & Diagnostic Lab", "Walk-ins Welcome" }
                ));
            }
        }

        if (shouldSearchServices)
        {
            var services = await _clinicRepository.SearchServicesAsync(q, request.Skip, request.Take, cancellationToken);
            foreach (var s in services)
            {
                servicesList.Add(new UnifiedServiceDto(
                    s.Id,
                    s.Name,
                    s.Description ?? "Clinical medical service",
                    s.DurationMinutes ?? 45,
                    true,
                    new List<string> { "Fully Covered by Insurance", "Prep Guide Included" }
                ));
            }
        }

        return new UnifiedSearchResultDto(doctorsList, clinicsList, servicesList);
    }
}
