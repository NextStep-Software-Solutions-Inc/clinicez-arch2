using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientMe;

public sealed class GetPatientMeQueryHandler : IRequestHandler<GetPatientMeQuery, PatientMeDto?>
{
    private readonly IPatientRepository _patientRepository;

    public GetPatientMeQueryHandler(IPatientRepository patientRepository) => _patientRepository = patientRepository;

    public async Task<PatientMeDto?> Handle(GetPatientMeQuery request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepository.GetForMeByClerkUserIdAsync(request.ClerkUserId, cancellationToken);
        if (patient is null) return null;

        var addresses = patient.Addresses
            .Select(a => new PatientAddressDto(
                a.Id, a.ClientId, a.Type.ToString(),
                a.HouseStreet, a.Barangay, a.CityMunicipality, a.Province, a.Region, a.ZipCode, a.Country,
                a.IsPrimary, a.UpdatedAt))
            .ToList().AsReadOnly();

        var primaryAddressEntity = patient.Addresses.FirstOrDefault(a => a.IsPrimary) 
                                   ?? patient.Addresses.FirstOrDefault();
        var formattedAddress = FormatAddress(primaryAddressEntity);

        var governmentIds = patient.GovernmentIds
            .Select(g => new PatientGovernmentIdDto(
                g.Id, g.ClientId, g.IdType.ToString().ToUpperInvariant(), g.IdNumber,
                g.IssuedAt, g.ExpiresAt, g.UpdatedAt))
            .ToList().AsReadOnly();

        var philHealthPin = patient.GovernmentIds
            .FirstOrDefault(g => g.IdType == GovernmentIdType.PhilHealth)?.IdNumber;

        var allergies = patient.Allergies
            .Select(a => new PatientAllergyDto(
                a.Id, a.ClientId, a.AllergenName, a.AllergyType.ToString(), a.Severity.ToString(),
                a.Reaction, a.OnsetDate, a.Notes, a.UpdatedAt))
            .ToList().AsReadOnly();

        return new PatientMeDto(
            Id: patient.Id,
            ClinicEzId: patient.ClinicEzId,
            FirstName: patient.FirstName,
            MiddleName: patient.MiddleName,
            LastName: patient.LastName,
            Suffix: patient.Suffix,
            Sex: patient.Sex?.ToString(),
            DateOfBirth: patient.DateOfBirth,
            CivilStatus: patient.CivilStatus?.ToString(),
            ContactNumber: patient.Mobile ?? patient.AltPhone,
            Mobile: patient.Mobile,
            Email: patient.Email,
            Address: formattedAddress,
            Addresses: addresses,
            PhilHealthPin: philHealthPin,
            GovernmentIds: governmentIds,
            Allergies: allergies
        );
    }

    private static string? FormatAddress(PatientAddress? address)
    {
        if (address is null) return null;
        var parts = new[]
        {
            address.HouseStreet,
            address.Barangay,
            address.CityMunicipality,
            address.Province,
            address.Region,
            address.ZipCode
        }
        .Where(p => !string.IsNullOrWhiteSpace(p))
        .Select(p => p!.Trim());

        var formatted = string.Join(", ", parts);
        return string.IsNullOrWhiteSpace(formatted) ? null : formatted;
    }
}
