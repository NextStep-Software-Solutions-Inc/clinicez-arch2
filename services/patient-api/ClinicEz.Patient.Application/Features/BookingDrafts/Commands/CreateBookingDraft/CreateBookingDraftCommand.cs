using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Common.Errors;
using ClinicEz.Patient.Application.Features.Sharing;
using ClinicEz.Shared.Interoperability;
using FluentValidation;

namespace ClinicEz.Patient.Application.Features.BookingDrafts.Commands.CreateBookingDraft;

public sealed record CreateBookingDraftCommand(
    Guid PatientId,
    Guid ClinicId,
    Guid? OrganizationId,
    DateOnly? PreferredDate,
    string? PreferredTime,
    string? Reason,
    string? Notes,
    string ShareFieldsJson,
    string AttachedFileIdsJson,
    IReadOnlyList<string>? ShareSections = null,
    string? TurnstileToken = null,
    string? RemoteIp = null) : IRequest<Guid>;

public sealed class CreateBookingDraftCommandValidator : AbstractValidator<CreateBookingDraftCommand>
{
    public CreateBookingDraftCommandValidator()
    {
        RuleFor(x => x.ShareSections)
            .Must(sections => sections is null || sections.Count == 0 || (SharingScopeMap.TryParse(sections, out var scopes) && !scopes.HasFlag(SharingScopes.Demographics)))
            .WithErrorCode(ErrorCodes.InvalidEnumValue)
            .WithMessage("Booking sections must be record categories such as Allergies or Medications; demographics are chosen with the share fields.");
    }
}
