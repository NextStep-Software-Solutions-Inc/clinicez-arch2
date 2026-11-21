using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientAddress : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public PatientAddressType AddressType { get; set; } = PatientAddressType.Permanent;
    public bool IsSameAsPermanent { get; set; } = false;

    public string? RegionPsgc { get; set; }
    public string? ProvincePsgc { get; set; }
    public string? CityMunicipalityPsgc { get; set; }
    public string? BarangayPsgc { get; set; }

    public string? RegionName { get; set; }
    public string? ProvinceName { get; set; }
    public string? CityMunicipalityName { get; set; }
    public string? BarangayName { get; set; }

    public string? ZipCode { get; set; }
    public string StreetAddress { get; set; } = string.Empty;
}
