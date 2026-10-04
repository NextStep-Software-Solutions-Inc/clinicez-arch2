using System;
using System.Collections.Generic;
using ClinicEz.Portal.Domain.Common;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>
/// Represents a physical branch, clinic location, or hospital campus operated by a Tenant.
/// Houses one or more facilities (Clinic, Laboratory, Pharmacy) under one roof and holds
/// the facility's statutory PhilHealth YAKAP accreditation and PMCC credentials.
/// </summary>
public class Branch : BaseEntity
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;

    public string Name { get; set; } = string.Empty;
    public string? Code { get; set; }
    public bool IsActive { get; set; } = true;

    // Physical Location & Philippine Standard Address
    public string? StreetAddress { get; set; }
    public string? Barangay { get; set; }
    public string? City { get; set; }
    public string? Province { get; set; }
    public string? Region { get; set; }
    public string? ZipCode { get; set; }
    public string? ContactNumber { get; set; }
    public string? ContactEmail { get; set; }

    // Statutory PhilHealth YAKAP Accreditation (1 PMCC per physical location)
    public string? PhilHealthAccreditationNumber { get; set; }
    public string? PhilHealthPmccNumber { get; set; }
    public string? PhilHealthSoftwareCertificateId { get; set; }
    public string? PhilHealthEncryptedUsername { get; set; }
    public string? PhilHealthEncryptedPassword { get; set; }
    public string? PhilHealthEncryptedCipherKey { get; set; }
    public string? PhilHealthKonsultaEndpoint { get; set; } = "https://staging.philhealth.gov.ph/KONSULTA/SOAP";
    public bool IsPhilHealthAccredited { get; set; } = false;

    // Associated facilities operating inside this physical branch
    public ICollection<Facility> Facilities { get; set; } = new List<Facility>();
}
