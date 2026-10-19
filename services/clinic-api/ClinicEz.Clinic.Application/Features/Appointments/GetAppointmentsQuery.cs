using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Appointments;

public sealed record AppointmentDto(
    Guid Id,
    string? TenantId,
    Guid ClinicId,
    Guid? DraftId,
    Guid PatientId,
    string PatientName,
    Guid? DoctorId,
    string? DoctorName,
    DateTime ScheduledAt,
    int DurationMinutes,
    AppointmentStatus Status,
    string? ServiceType,
    string? Reason,
    string? Notes,
    DateTime CreatedAt,
    string AttachedFileIdsJson,
    string ShareFieldsJson,
    IReadOnlyList<string> SharedScopes,
    IReadOnlyList<ShareItemDto> SharedItems)
{
    public static AppointmentDto From(Appointment a) => new(
        a.Id,
        a.TenantId,
        a.ClinicId,
        a.DraftId,
        a.PatientId,
        a.PatientName,
        a.DoctorId,
        a.DoctorName,
        a.ScheduledAt,
        a.DurationMinutes,
        a.Status,
        a.ServiceType,
        a.Reason,
        a.Notes,
        a.CreatedAt,
        a.AttachedFileIdsJson ?? "[]",
        a.ShareFieldsJson ?? "[]",
        SharingScopeNames.Of(a.SharedScopes),
        ParseItems(a.SharedItemsJson));

    private static IReadOnlyList<ShareItemDto> ParseItems(string? json) =>
        string.IsNullOrWhiteSpace(json)
            ? []
            : JsonSerializer.Deserialize<List<ShareItemDto>>(json) ?? [];
}

public sealed record GetAppointmentsQuery(
    DateOnly? Date = null,
    AppointmentStatus? Status = null) : IRequest<IReadOnlyList<AppointmentDto>>;

public sealed class GetAppointmentsQueryHandler : IRequestHandler<GetAppointmentsQuery, IReadOnlyList<AppointmentDto>>
{
    private readonly IRepository<Appointment> _appointmentRepository;
    private readonly IClinicContext _clinicContext;

    public GetAppointmentsQueryHandler(
        IRepository<Appointment> appointmentRepository,
        IClinicContext clinicContext)
    {
        _appointmentRepository = appointmentRepository;
        _clinicContext = clinicContext;
    }

    public async Task<IReadOnlyList<AppointmentDto>> Handle(GetAppointmentsQuery request, CancellationToken cancellationToken)
    {
        var query = _appointmentRepository.Query(a => a.ClinicId == _clinicContext.ClinicId)
            .AsQueryable();

        if (request.Date.HasValue)
        {
            var startUtc = request.Date.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            var endUtc = request.Date.Value.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc);
            query = query.Where(a => a.ScheduledAt >= startUtc && a.ScheduledAt <= endUtc);
        }

        if (request.Status.HasValue)
        {
            query = query.Where(a => a.Status == request.Status.Value);
        }

        var list = await query
            .OrderBy(a => a.ScheduledAt)
            .ToListAsync(cancellationToken);

        return list.Select(AppointmentDto.From).ToList();
    }
}
