using System;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record PatientAddressDto(
    string AddressType = "Permanent",
    bool IsSameAsPermanent = false,
    string? RegionPsgc = null,
    string? ProvincePsgc = null,
    string? CityMunicipalityPsgc = null,
    string? BarangayPsgc = null,
    string? RegionName = null,
    string? ProvinceName = null,
    string? CityMunicipalityName = null,
    string? BarangayName = null,
    string StreetAddress = "",
    string? ZipCode = null,
    Guid? Id = null);
