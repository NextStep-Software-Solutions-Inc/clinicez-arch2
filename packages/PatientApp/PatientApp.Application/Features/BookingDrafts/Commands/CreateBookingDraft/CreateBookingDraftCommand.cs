using MediatR;
using PatientApp.Application.Common.DTOs;

namespace PatientApp.Application.Features.BookingDrafts.Commands.CreateBookingDraft;

public sealed record CreateBookingDraftCommand(
    Guid PatientId,
    Guid ClinicId,
    Guid? OrganizationId,
    DateOnly? PreferredDate,
    string? PreferredTime,
    string? Reason,
    string? Notes,
    string ShareFieldsJson) : IRequest<Guid>;
