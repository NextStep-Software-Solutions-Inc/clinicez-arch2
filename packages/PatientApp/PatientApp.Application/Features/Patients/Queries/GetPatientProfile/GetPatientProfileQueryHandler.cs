using CLINICEZ.Shared.Exceptions;
using MediatR;
using PatientApp.Application.Common.DTOs;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Application.Features.Patients.Queries.GetPatientProfile;

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
            patient.FirstName,
            patient.MiddleName,
            patient.LastName,
            patient.Suffix,
            patient.Sex?.ToString(),
            patient.DateOfBirth,
            patient.BloodType?.ToString(),
            patient.CivilStatus?.ToString(),
            patient.Nationality,
            patient.Mobile,
            patient.Email,
            patient.AvatarUrl,
            patient.ConsentToShareInfo);

        var addresses = patient.Addresses
            .Select(a => new PatientAddressDto(
                a.Id, a.Type.ToString(), a.Street, a.Barangay,
                a.City, a.Province, a.ZipCode, a.Country, a.IsPrimary))
            .ToList()
            .AsReadOnly();

        var emergencyContacts = patient.EmergencyContacts
            .Select(e => new EmergencyContactDto(
                e.Id, e.FullName, e.Relationship, e.Mobile, e.AltPhone, e.IsPrimary))
            .ToList()
            .AsReadOnly();

        return new PatientProfileDto(demographics, addresses, emergencyContacts);
    }
}
