using MediatR;

namespace ClinicEz.Patient.Application.Features.Clinics.Commands.JoinClinic;

public sealed record JoinClinicCommand(
    Guid PatientId,
    Guid ClinicId,
    bool ConsentPrivacyPolicy,
    bool ConsentTermsAndConditions,
    bool ConsentDataSharing) : IRequest<Guid>;
