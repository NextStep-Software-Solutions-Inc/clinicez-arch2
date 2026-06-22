using System.Globalization;
using CLINICEZ.Shared.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Interfaces;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Application.Features.Appointments.Queries.GetAvailableSlots;

public sealed record AvailableSlotDto(
    string Id,
    string Time,
    string DisplayTime,
    string Period,
    bool Available);

public sealed record GetAvailableSlotsQuery(Guid ClinicId, Guid ProviderId, DateOnly Date) : IRequest<List<AvailableSlotDto>>;

public sealed class GetAvailableSlotsQueryHandler : IRequestHandler<GetAvailableSlotsQuery, List<AvailableSlotDto>>
{
    private readonly IProviderAvailabilityRepository _providerAvailabilityRepository;
    private readonly IAppointmentRepository _appointmentRepository;

    public GetAvailableSlotsQueryHandler(IProviderAvailabilityRepository providerAvailabilityRepository, IAppointmentRepository appointmentRepository)
    {
        _providerAvailabilityRepository = providerAvailabilityRepository;
        _appointmentRepository = appointmentRepository;
    }

    public async Task<List<AvailableSlotDto>> Handle(GetAvailableSlotsQuery request, CancellationToken cancellationToken)
    {
        var slots = new List<AvailableSlotDto>();

        var dayOfWeek = request.Date.DayOfWeek;
        
        var availabilities = await _providerAvailabilityRepository.FindAsync(
            pa => pa.ClinicHealthcareProviderId == request.ProviderId && pa.DayOfWeek == dayOfWeek && pa.IsActive,
            cancellationToken);

        var existingAppointments = await _appointmentRepository.FindAsync(
            a => a.ClinicId == request.ClinicId 
                        && a.ProviderId == request.ProviderId 
                        && a.ScheduledAt.Date == request.Date.ToDateTime(TimeOnly.MinValue).Date,
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
