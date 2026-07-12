using MediatR;

namespace PatientAppBE.Application.Features.Clinics.Commands.JoinClinic;

public sealed record JoinClinicCommand(
    Guid PatientId,
    Guid ClinicId,
    bool ConsentPrivacyPolicy,
    bool ConsentTermsAndConditions,
    bool ConsentDataSharing) : IRequest<Guid>;
