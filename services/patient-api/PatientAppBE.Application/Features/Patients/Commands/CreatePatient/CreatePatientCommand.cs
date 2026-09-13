using MediatR;

namespace PatientAppBE.Application.Features.Patients.Commands.CreatePatient;

public sealed record CreatePatientCommand(
    string ClerkUserId,
    string FirstName,
    string? MiddleName,
    string LastName,
    string? Suffix,
    string? Sex,
    DateOnly? DateOfBirth,
    string? Nationality) : IRequest<Guid>;
