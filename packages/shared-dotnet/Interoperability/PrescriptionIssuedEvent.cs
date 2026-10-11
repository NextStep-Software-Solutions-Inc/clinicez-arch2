using System;
using System.Collections.Generic;

namespace ClinicEz.Shared.Interoperability;

public record PrescriptionItemDto
{
    public Guid ItemId { get; init; } = Guid.NewGuid();
    public string GenericName { get; init; } = string.Empty;
    public string? BrandName { get; init; }
    public string Dosage { get; init; } = string.Empty;
    public string Form { get; init; } = "Tablet"; // Tablet, Capsule, Syrup, Suspension, Ointment, Injection
    public string Sig { get; init; } = string.Empty; // Directions / frequency / duration
    public int Quantity { get; init; }
    public int? DurationDays { get; init; }
    public int Refills { get; init; } = 0;
    public bool IsDangerousDrug { get; init; } = false; // Requires S2 license
    public string? Remarks { get; init; }
}

public record PrescriberDoctorDto
{
    public string DoctorId { get; init; } = string.Empty;
    public string DoctorName { get; init; } = string.Empty;
    public string PrcLicenseNumber { get; init; } = string.Empty;
    public string? PtrNumber { get; init; }
    public string? S2LicenseNumber { get; init; }
    public string? Specialization { get; init; }
}

public record PrescriptionPatientDto
{
    public Guid PatientId { get; init; }
    public string? PhilHealthPin { get; init; }
    public string? NationalId { get; init; }
    public string FullName { get; init; } = string.Empty;
    public string? DateOfBirth { get; init; }
    public int Age { get; init; }
    public string Gender { get; init; } = "Unknown";
    public string? ContactNumber { get; init; }
    public string? Allergies { get; init; }
}

public record PrescriptionIssuedEvent
{
    public Guid PrescriptionId { get; init; } = Guid.NewGuid();
    public string PrescriptionNumber { get; init; } = string.Empty;
    public string OrderingFacilityId { get; init; } = string.Empty;
    public string OrderingFacilityName { get; init; } = string.Empty;
    public string TenantId { get; init; } = string.Empty;
    public string? BranchId { get; init; }
    /// <summary>Clinic encounter/queue id; lets the shared cashier consolidate clinic, lab and pharmacy charges of one visit.</summary>
    public string? VisitKey { get; init; }
    public string? TargetPharmacyFacilityId { get; init; }
    public string? TargetPharmacyTenantId { get; init; }
    public PrescriberDoctorDto PrescriberDoctor { get; init; } = new();
    public PrescriptionPatientDto Patient { get; init; } = new();
    public string? ClinicalDiagnosis { get; init; }
    public string? SpecialInstructions { get; init; }
    public List<PrescriptionItemDto> Items { get; init; } = new();
    public string PublicVerificationToken { get; init; } = string.Empty;
    public string PublicVerificationUrl { get; init; } = string.Empty;
    public string QrPayload { get; init; } = string.Empty;
    public DateTime IssuedAt { get; init; } = DateTime.UtcNow;
}
