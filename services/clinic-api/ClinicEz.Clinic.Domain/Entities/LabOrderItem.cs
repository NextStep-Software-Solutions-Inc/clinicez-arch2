using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class LabOrderItem : ClinicScopedEntity
{
    public Guid LabOrderId { get; set; }
    public LabOrder LabOrder { get; set; } = null!;

    public required string TestName { get; set; }
    public required string Category { get; set; }
    public string? Instructions { get; set; }
    public LabOrderStatus Status { get; set; } = LabOrderStatus.Ordered;
    public string? PhilHealthServiceCode { get; set; }
    public string? TestCode { get; set; }
    public string? PhilHealthResultTransNo { get; set; }

    public string? LoincCode { get; set; }
    public bool IsPhysicianRecommended { get; set; } = true;
    public string? PatientComplianceCode { get; set; }
    public decimal? DiagnosticFee { get; set; }

    public bool IsDoneOutsideFacility { get; set; } = false;
    public string? ExternalFacilityName { get; set; }
    public DateOnly? PerformedDate { get; set; }
    public string? PathologistRadiologistName { get; set; }
    public string? PathologistRadiologistPrcNo { get; set; }
    public string? PathologistPan { get; set; }
    public string? RecommendationCode { get; set; }
    public string? ClientConsentCode { get; set; }
    public string? UnlistedTestSpecification { get; set; }
    public string? PhilHealthTestStatusCode { get; set; }
    public string? TestLocationCode { get; set; }
    public string? ResultRemarks { get; set; }
}
