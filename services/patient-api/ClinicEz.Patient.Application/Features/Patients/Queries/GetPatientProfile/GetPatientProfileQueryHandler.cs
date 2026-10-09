using ClinicEz.Shared.Exceptions;
using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientProfile;

public sealed class GetPatientProfileQueryHandler : IRequestHandler<GetPatientProfileQuery, PatientProfileDto>
{
    private readonly IPatientRepository _patientRepository;

    public GetPatientProfileQueryHandler(IPatientRepository patientRepository)
        => _patientRepository = patientRepository;

    public async Task<PatientProfileDto> Handle(GetPatientProfileQuery request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepository.GetWithProfileAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        var demographics = new PatientSummaryDto(
            patient.Id,
            patient.FirstName, patient.MiddleName, patient.LastName, patient.Suffix,
            patient.Sex?.ToString(), patient.DateOfBirth, patient.PlaceOfBirth,
            patient.BloodType?.ToString(), patient.CivilStatus?.ToString(),
            patient.Nationality, patient.Ethnicity, patient.Religion, patient.PrimaryLanguage,
            patient.EducationLevel?.ToString(),
            patient.Mobile, patient.AltPhone, patient.Email, patient.MessengerHandle,
            patient.AvatarUrl,
            patient.ConsentToShareInfo,
            patient.ClinicEzId);

        var addresses = patient.Addresses
            .Select(a => new PatientAddressDto(
                a.Id, a.ClientId, a.Type.ToString(),
                a.HouseStreet, a.Barangay, a.CityMunicipality, a.Province, a.Region, a.ZipCode, a.Country,
                a.IsPrimary, a.UpdatedAt))
            .ToList().AsReadOnly();

        var emergencyContacts = patient.EmergencyContacts
            .Select(e => new EmergencyContactDto(
                e.Id, e.ClientId, e.FullName, e.Relationship,
                e.Mobile, e.AltPhone, e.IsPrimary, e.UpdatedAt))
            .ToList().AsReadOnly();

        return new PatientProfileDto(demographics, addresses, emergencyContacts);
    }
}
