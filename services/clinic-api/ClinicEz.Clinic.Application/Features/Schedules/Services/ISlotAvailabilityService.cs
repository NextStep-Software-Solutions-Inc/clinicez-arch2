using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Schedules.DTOs;

namespace ClinicEz.Clinic.Application.Features.Schedules.Services;

public interface ISlotAvailabilityService
{
    Task<DoctorAvailabilityDto> GetDoctorAvailabilityAsync(
        Guid clinicId,
        Guid doctorId,
        DateOnly date,
        int? requestedSlotDurationMinutes = null,
        CancellationToken ct = default);
}
