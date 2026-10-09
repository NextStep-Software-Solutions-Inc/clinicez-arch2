using System;
using System.Collections.Generic;
using ClinicEz.Laboratory.Domain.Enums;

namespace ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;

public record SpecimenDto
{
    public Guid Id { get; init; }
    public string Barcode { get; init; } = string.Empty;
    public string ContainerType { get; init; } = string.Empty;
    public string SpecimenType { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public DateTime? CollectedAt { get; init; }
    public string? CollectedByPhlebotomistName { get; init; }
    public DateTime? ReceivedInLabAt { get; init; }
    public string? Notes { get; init; }

    // Rejection metadata
    public string RejectionReason { get; init; } = "None";
    public string? RejectionNotes { get; init; }
    public DateTime? RejectedAt { get; init; }
    public string? RejectedByPhlebotomistName { get; init; }
    public string? CorrectiveAction { get; init; }

    // Storage Rack metadata
    public string? RackId { get; init; }
    public string? RackPosition { get; init; }
    public string StorageTemperature { get; init; } = "Refrigerated_2_8C";
    public string StorageStatus { get; init; } = "InTesting";
    public DateTime? StoredAt { get; init; }
    public DateTime? DisposedAt { get; init; }
}

public record AnalyteResultDto
{
    public Guid Id { get; init; }
    public string PanelName { get; init; } = string.Empty;
    public string AnalyteCode { get; init; } = string.Empty;
    public string AnalyteName { get; init; } = string.Empty;
    public string Value { get; init; } = string.Empty;
    public string Unit { get; init; } = string.Empty;
    public string ReferenceInterval { get; init; } = string.Empty;
    public string Flag { get; init; } = "Normal";
    public string? Interpretation { get; init; }
    public string? EnteredByMedTechName { get; init; }
    public DateTime EnteredAt { get; init; }
    public string? DeltaCheckAlert { get; init; }
}

public record DiagnosticReportDto
{
    public Guid Id { get; init; }
    public string ReportNumber { get; init; } = string.Empty;
    public DateTime ReleasedAt { get; init; }
    public string PathologistName { get; init; } = string.Empty;
    public string PathologistPrcLicense { get; init; } = string.Empty;
    public string MedicalTechnologistName { get; init; } = string.Empty;
    public string MedicalTechnologistPrcLicense { get; init; } = string.Empty;
    public string? PathologistImpression { get; init; }
    public bool IsCriticalResult { get; init; }
    public string? SignedPdfBase64 { get; init; }
}

public record LabRequisitionDto
{
    public Guid Id { get; init; }
    public string? BranchId { get; init; }
    public Guid? ExternalRequisitionId { get; init; }
    public string AccessionNumber { get; init; } = string.Empty;
    public string OrderingFacilityName { get; init; } = string.Empty;
    public string OrderingDoctorName { get; init; } = string.Empty;
    public string? OrderingDoctorPrc { get; init; }
    public Guid PatientId { get; init; }
    public string PatientName { get; init; } = string.Empty;
    public string? PhilHealthPin { get; init; }
    public int PatientAge { get; init; }
    public string PatientGender { get; init; } = "Unknown";
    public string? ContactNumber { get; init; }
    public string? ClinicalDiagnosis { get; init; }
    public string? FastingInstructions { get; init; }
    public string Urgency { get; init; } = "Routine";
    public string Status { get; init; } = "PendingAccession";

    /// <summary>Order lifecycle stage (Routed, Claimed, AwaitingPayment, Paid, SpecimenCollected, InProcess, ResultFinalized, Rejected, Cancelled).</summary>
    public string Stage { get; init; } = "Routed";
    public string? StageReason { get; init; }
    public string PaymentPolicy { get; init; } = "None";
    public decimal? QuotedAmount { get; init; }
    public string Currency { get; init; } = "PHP";
    /// <summary>True while a prepaid order is unpaid: specimen collection and processing are blocked (HTTP 409 <c>payment_required</c>).</summary>
    public bool PaymentRequired { get; init; }
    public bool Paid { get; init; }
    public DateTime? PaidAtUtc { get; init; }
    public string? ReceiptNumber { get; init; }
    public Guid? InvoiceId { get; init; }
    public DateTime CreatedAt { get; init; }
    public List<SpecimenDto> Specimens { get; init; } = new();
    public List<AnalyteResultDto> AnalyteResults { get; init; } = new();
    public DiagnosticReportDto? DiagnosticReport { get; init; }
}

public record PrintableTubeStickerDto
{
    public required string Barcode { get; init; }
    public required string AccessionNumber { get; init; }
    public required string PatientName { get; init; }
    public required string PatientGender { get; init; }
    public int PatientAge { get; init; }
    public string? PhilHealthPin { get; init; }
    public required string ContainerType { get; init; }
    public required string ContainerColor { get; init; }
    public required string HexColor { get; init; }
    public required string SpecimenType { get; init; }
    public required string RequiredTests { get; init; }
    public string Urgency { get; init; } = "Routine";
    public DateTime? DrawnAt { get; init; }
    public string? PhlebotomistName { get; init; }
    public string? RackLocation { get; init; }
}

public record RackInventoryItemDto
{
    public Guid SpecimenId { get; init; }
    public Guid RequisitionId { get; init; }
    public string Barcode { get; init; } = string.Empty;
    public string AccessionNumber { get; init; } = string.Empty;
    public string PatientName { get; init; } = string.Empty;
    public string ContainerType { get; init; } = string.Empty;
    public string SpecimenType { get; init; } = string.Empty;
    public string RackId { get; init; } = string.Empty;
    public string RackPosition { get; init; } = string.Empty;
    public string StorageTemperature { get; init; } = string.Empty;
    public string StorageStatus { get; init; } = string.Empty;
    public DateTime? StoredAt { get; init; }
}

public record DeltaCheckResultDto
{
    public string AnalyteCode { get; init; } = string.Empty;
    public string AnalyteName { get; init; } = string.Empty;
    public string CurrentValue { get; init; } = string.Empty;
    public string PreviousValue { get; init; } = string.Empty;
    public DateTime PreviousEncounterDate { get; init; }
    public double PercentShift { get; init; }
    public double AbsoluteShift { get; init; }
    public bool ThresholdExceeded { get; init; }
    public string AlertSeverity { get; init; } = "Normal";
    public string Message { get; init; } = string.Empty;
}

public record QcLotDto
{
    public Guid Id { get; init; }
    public string TenantId { get; init; } = string.Empty;
    public string LotNumber { get; init; } = string.Empty;
    public string ControlName { get; init; } = string.Empty;
    public string Level { get; init; } = string.Empty;
    public string AnalyteCode { get; init; } = string.Empty;
    public string InstrumentName { get; init; } = string.Empty;
    public double TargetMean { get; init; }
    public double TargetStandardDeviation { get; init; }
    public DateTime ManufacturerExpirationDate { get; init; }
    public DateTime? OpenVialDate { get; init; }
    public int OpenVialStabilityDays { get; init; }
    public DateTime? OpenVialExpirationDate { get; init; }
    public bool IsExpired { get; init; }
    public int? DaysRemaining { get; init; }
    public bool IsActive { get; init; }
}

public record QcRunDto
{
    public Guid Id { get; init; }
    public Guid QcLotId { get; init; }
    public string AnalyteCode { get; init; } = string.Empty;
    public double MeasuredValue { get; init; }
    public double ZScore { get; init; }
    public DateTime RunAt { get; init; }
    public string RunByMedTechName { get; init; } = string.Empty;
    public string Status { get; init; } = "Passed";
    public string ViolationRules { get; init; } = string.Empty;
    public string? CorrectiveAction { get; init; }
    public string? Notes { get; init; }
}

public record LeveyJenningsPointDto
{
    public Guid RunId { get; init; }
    public DateTime RunAt { get; init; }
    public double MeasuredValue { get; init; }
    public double ZScore { get; init; }
    public string Status { get; init; } = "Passed";
    public string? ViolationRules { get; init; }
}

public record LeveyJenningsChartDto
{
    public Guid LotId { get; init; }
    public string LotNumber { get; init; } = string.Empty;
    public string ControlName { get; init; } = string.Empty;
    public string Level { get; init; } = string.Empty;
    public string AnalyteCode { get; init; } = string.Empty;
    public double TargetMean { get; init; }
    public double TargetSD { get; init; }
    public double Plus1SD { get; init; }
    public double Plus2SD { get; init; }
    public double Plus3SD { get; init; }
    public double Minus1SD { get; init; }
    public double Minus2SD { get; init; }
    public double Minus3SD { get; init; }
    public List<LeveyJenningsPointDto> Points { get; init; } = new();
}

public record CriticalPanicDispatchLogDto
{
    public Guid Id { get; init; }
    public Guid RequisitionId { get; init; }
    public string AccessionNumber { get; init; } = string.Empty;
    public Guid PatientId { get; init; }
    public string PatientName { get; init; } = string.Empty;
    public string OrderingDoctorName { get; init; } = string.Empty;
    public string OrderingFacilityName { get; init; } = string.Empty;
    public string CriticalFindings { get; init; } = string.Empty;
    public DateTime DispatchedAt { get; init; }
    public string DispatchedByMedTechName { get; init; } = string.Empty;
    public string NotifiedDoctorName { get; init; } = string.Empty;
    public string NotificationMethod { get; init; } = "Telephone";
    public bool ReadbackConfirmed { get; init; }
    public string? ReadbackNotes { get; init; }
    public DateTime? AcknowledgedAt { get; init; }
}
