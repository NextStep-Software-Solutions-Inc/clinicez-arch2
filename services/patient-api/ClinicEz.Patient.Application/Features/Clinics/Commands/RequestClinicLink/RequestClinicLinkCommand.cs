using System;
using System.Collections.Generic;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Clinics.Commands.RequestClinicLink;

public sealed record RequestClinicLinkCommand(
    Guid PatientId,
    Guid ClinicId,
    bool ConsentPrivacyPolicy,
    bool ConsentTermsAndConditions,
    bool ConsentDataSharing,
    string? VerifiedEmail = null,
    IReadOnlyDictionary<string, string>? IdentifierClaims = null) : IRequest<Guid>;
