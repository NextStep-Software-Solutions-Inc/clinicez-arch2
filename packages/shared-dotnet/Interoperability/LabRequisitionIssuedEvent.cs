using System;
using System.Collections.Generic;

namespace ClinicEz.Shared.Interoperability;

public record RequisitionItemDto
{
    public string ItemCode { get; init; } = string.Empty;
    public string ItemName { get; init; } = string.Empty;
    public string Category { get; init; } = "Clinical Laboratory";
    public string Urgency { get; init; } = "Routine";
    public string? SpecimenRequirement { get; init; }
}

public record OrderingDoctorDto
{
    public string DoctorId { get; init; } = string.Empty;
    public string DoctorName { get; init; } = string.Empty;
    public string PrcLicenseNumber { get; init; } = string.Empty;
    public string? PtrNumber { get; init; }
    public string? Specialization { get; init; }
}

public record RequisitionPatientDto
{
    public Guid PatientId { get; init; }
    public string? PhilHealthPin { get; init; }
    public string? NationalId { get; init; }
    public string FullName { get; init; } = string.Empty;
    public string? DateOfBirth { get; init; }
    public int Age { get; init; }
    public string Gender { get; init; } = "Unknown";
    public string? ContactNumber { get; init; }
}

public record LabRequisitionIssuedEvent
{
    public Guid RequisitionId { get; init; } = Guid.NewGuid();
    public string AccessionNumber { get; init; } = string.Empty;
    public string OrderingFacilityId { get; init; } = string.Empty;
    public string OrderingFacilityName { get; init; } = string.Empty;
    public string TenantId { get; init; } = string.Empty;
    public string? TargetFacilityId { get; init; }
    public string? TargetTenantId { get; init; }
    public OrderingDoctorDto OrderingDoctor { get; init; } = new();
    public RequisitionPatientDto Patient { get; init; } = new();
    public string? Icd10Code { get; init; }
    public string? ProvisionalDiagnosis { get; init; }
    public string? FastingInstructions { get; init; }
    public string Urgency { get; init; } = "Routine";
    public List<RequisitionItemDto> Items { get; init; } = new();
    public string PublicUploadToken { get; init; } = string.Empty;
    public string PublicUploadUrl { get; init; } = string.Empty;
    public DateTime IssuedAt { get; init; } = DateTime.UtcNow;
}
