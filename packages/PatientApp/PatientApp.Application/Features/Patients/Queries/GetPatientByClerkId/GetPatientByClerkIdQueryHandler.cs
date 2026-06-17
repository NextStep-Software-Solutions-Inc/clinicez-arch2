using MediatR;
using PatientApp.Application.Common.DTOs;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Application.Features.Patients.Queries.GetPatientByClerkId;

public sealed class GetPatientByClerkIdQueryHandler : IRequestHandler<GetPatientByClerkIdQuery, PatientSummaryDto?>
{
    private readonly IPatientRepository _patientRepository;

    public GetPatientByClerkIdQueryHandler(IPatientRepository patientRepository) => _patientRepository = patientRepository;

    public async Task<PatientSummaryDto?> Handle(GetPatientByClerkIdQuery request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepository.GetByClerkUserIdAsync(request.ClerkUserId, cancellationToken);

        return patient is null ? null : new PatientSummaryDto(
            patient.Id,
            patient.FirstName, patient.MiddleName, patient.LastName, patient.Suffix,
            patient.Sex?.ToString(), patient.DateOfBirth, patient.PlaceOfBirth,
            patient.BloodType?.ToString(), patient.CivilStatus?.ToString(),
            patient.Nationality, patient.Ethnicity, patient.Religion, patient.PrimaryLanguage,
            patient.EducationLevel?.ToString(),
            patient.Mobile, patient.AltPhone, patient.Email, patient.MessengerHandle,
            patient.AvatarUrl,
            patient.ConsentToShareInfo);
    }
}
