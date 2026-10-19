using System.Globalization;
using ClinicEz.Shared.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.Appointments.Queries.GetAvailableSlots;

public sealed record AvailableSlotDto(
    string Id,
    string Time,
    string DisplayTime,
    string Period,
    bool Available);

public sealed record GetAvailableSlotsQuery(Guid ClinicId, Guid ProviderId, DateOnly Date, Guid? ForPatientId = null) : IRequest<List<AvailableSlotDto>>;

public sealed class GetAvailableSlotsQueryHandler : IRequestHandler<GetAvailableSlotsQuery, List<AvailableSlotDto>>
{
    private readonly IProviderAvailabilityRepository _providerAvailabilityRepository;
    private readonly IAppointmentRepository _appointmentRepository;
    private readonly IClinicRepository? _clinicRepository;
    private readonly IClinicMembershipRepository? _membershipRepository;
    private readonly IOrganizationMembershipRepository? _orgMembershipRepository;

    public GetAvailableSlotsQueryHandler(
        IProviderAvailabilityRepository providerAvailabilityRepository,
        IAppointmentRepository appointmentRepository,
        IClinicRepository? clinicRepository = null,
        IClinicMembershipRepository? membershipRepository = null,
        IOrganizationMembershipRepository? orgMembershipRepository = null)
    {
        _providerAvailabilityRepository = providerAvailabilityRepository;
        _appointmentRepository = appointmentRepository;
        _clinicRepository = clinicRepository;
        _membershipRepository = membershipRepository;
        _orgMembershipRepository = orgMembershipRepository;
    }

    public async Task<List<AvailableSlotDto>> Handle(GetAvailableSlotsQuery request, CancellationToken cancellationToken)
    {
        if (_clinicRepository != null)
        {
            var clinic = await _clinicRepository.GetByIdAsync(request.ClinicId, cancellationToken);
            if (clinic != null && clinic.IsGated)
            {
                var isUnlocked = false;
                if (request.ForPatientId.HasValue && _membershipRepository != null)
                {
                    var membership = await _membershipRepository.GetByPatientAndClinicAsync(
                        request.ForPatientId.Value, request.ClinicId, cancellationToken);
                    if (membership != null && membership.Status == Domain.Enums.ClinicMembershipStatus.Active)
                    {
                        isUnlocked = true;
                    }
                    else if (_orgMembershipRepository != null)
                    {
                        var linkedOrgIds = clinic.OrganizationLinks
                            .Where(l => l.IsActive)
                            .Select(l => l.OrganizationId)
                            .ToHashSet();

                        if (linkedOrgIds.Count > 0)
                        {
                            var orgMemberships = await _orgMembershipRepository.GetByPatientAsync(
                                request.ForPatientId.Value, cancellationToken);
                            if (orgMemberships.Any(m => m.Status == Domain.Enums.ClinicMembershipStatus.Active && linkedOrgIds.Contains(m.OrganizationId)))
                            {
                                isUnlocked = true;
                            }
                        }
                    }
                }

                if (!isUnlocked)
                {
                    return [];
                }
            }
        }

        var slots = new List<AvailableSlotDto>();

        var dayOfWeek = request.Date.DayOfWeek;
        
        var availabilities = await _providerAvailabilityRepository.FindAsync(
            pa => pa.ClinicHealthcareProviderId == request.ProviderId && pa.DayOfWeek == dayOfWeek && pa.IsActive,
            cancellationToken);

        var year = request.Date.Year;
        var month = request.Date.Month;
        var day = request.Date.Day;
        var startOfDay = new DateTime(year, month, day, 0, 0, 0, DateTimeKind.Utc);
        var endOfDay = startOfDay.AddDays(1);

        var existingAppointments = await _appointmentRepository.FindAsync(
            a => a.ClinicId == request.ClinicId 
                        && a.ProviderId == request.ProviderId 
                        && a.ScheduledAt >= startOfDay 
                        && a.ScheduledAt < endOfDay,
            cancellationToken);

        var intervalMinutes = 30;

        foreach (var availability in availabilities)
        {
            var currentTime = availability.StartTime;
            while (currentTime.Add(TimeSpan.FromMinutes(intervalMinutes)) <= availability.EndTime)
            {
                var timeString = currentTime.ToString(@"hh\:mm");
                var id = $"{request.Date:yyyy-MM-dd}-{timeString}";
                
                var displayTime = DateTime.Today.Add(currentTime).ToString("h:mm tt", CultureInfo.InvariantCulture);
                var period = currentTime.Hours < 12 ? "morning" : currentTime.Hours < 17 ? "afternoon" : "evening";

                var isAvailable = !existingAppointments.Any(a => 
                {
                    var apptTime = a.ScheduledAt.TimeOfDay;
                    var apptEndTime = apptTime.Add(TimeSpan.FromMinutes(a.DurationMinutes));
                    return (currentTime >= apptTime && currentTime < apptEndTime) || 
                           (currentTime.Add(TimeSpan.FromMinutes(intervalMinutes)) > apptTime && currentTime.Add(TimeSpan.FromMinutes(intervalMinutes)) <= apptEndTime);
                });

                slots.Add(new AvailableSlotDto(id, timeString, displayTime, period, isAvailable));

                currentTime = currentTime.Add(TimeSpan.FromMinutes(intervalMinutes));
            }
        }

        return [.. slots.OrderBy(s => s.Time)];
    }
}
