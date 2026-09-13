using MediatR;

namespace PatientAppBE.Application.Features.Patients.Commands.UpdatePatientDemographics;

public sealed record UpdatePatientDemographicsCommand(
    Guid PatientId,
    string FirstName,
    string? MiddleName,
    string LastName,
    string? Suffix,
    string? Sex,
    DateOnly? DateOfBirth,
    string? PlaceOfBirth,
    string? CivilStatus,
    string? BloodType,
    string? Nationality,
    string? Ethnicity,
    string? Religion,
    string? PrimaryLanguage,
    string? EducationLevel,
    string? Mobile,
    string? AltPhone,
    string? Email,
    string? MessengerHandle,
    bool ConsentToShareInfo) : IRequest;
