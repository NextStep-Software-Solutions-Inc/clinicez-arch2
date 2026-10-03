using System;
using ClinicEz.Laboratory.Domain.Common;
using ClinicEz.Laboratory.Domain.Enums;

namespace ClinicEz.Laboratory.Domain.Entities;

public sealed class LabStaffMember : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid LaboratoryId { get; set; }

    public required string FirstName { get; set; }
    public required string LastName { get; set; }
    public string? MiddleName { get; set; }
    public string? Title { get; set; } // e.g. "MD, FPSP", "RMT"

    public LabStaffRole Role { get; set; }

    public string? Email { get; set; }
    public string? PhoneNumber { get; set; }

    // Professional regulation compliance (PRC / PTR)
    public string? PrcLicenseNumber { get; set; }
    public string? PtrNumber { get; set; }
    public string? Specialty { get; set; }

    public bool IsActive { get; set; } = true;
}
