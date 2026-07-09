using MediatR;
using PatientAppBE.Application.Common.DTOs;

namespace PatientAppBE.Application.Features.BookingDrafts.Commands.CreateBookingDraft;

public sealed record CreateBookingDraftCommand(
    Guid PatientId,
    Guid ClinicId,
    Guid? OrganizationId,
    DateOnly? PreferredDate,
    string? PreferredTime,
    string? Reason,
    string? Notes,
    string ShareFieldsJson,
    string AttachedFileIdsJson) : IRequest<Guid>;
