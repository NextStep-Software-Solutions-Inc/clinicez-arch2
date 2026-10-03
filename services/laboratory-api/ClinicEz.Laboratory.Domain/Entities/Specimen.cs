using System;
using ClinicEz.Laboratory.Domain.Common;
using ClinicEz.Laboratory.Domain.Enums;

namespace ClinicEz.Laboratory.Domain.Entities;

public sealed class Specimen : BaseEntity
{
    public Guid LabRequisitionId { get; set; }
    public required string Barcode { get; set; }
    public SpecimenContainerType ContainerType { get; set; }
    public string SpecimenType { get; set; } = "WholeBlood"; // WholeBlood, Serum, Plasma, Urine, Stool
    public SpecimenStatus Status { get; set; } = SpecimenStatus.Pending;

    public DateTime? CollectedAt { get; set; }
    public string? CollectedByPhlebotomistName { get; set; }
    public DateTime? ReceivedInLabAt { get; set; }
    public string? Notes { get; set; }

    // Specimen Rejection Workflow
    public SpecimenRejectionReason RejectionReason { get; set; } = SpecimenRejectionReason.None;
    public string? RejectionNotes { get; set; }
    public DateTime? RejectedAt { get; set; }
    public string? RejectedByPhlebotomistName { get; set; }
    public string? CorrectiveAction { get; set; }

    // Storage Rack & Routing Tracking
    public string? RackId { get; set; }
    public string? RackPosition { get; set; }
    public StorageTemperature StorageTemperature { get; set; } = StorageTemperature.Refrigerated_2_8C;
    public SpecimenStorageStatus StorageStatus { get; set; } = SpecimenStorageStatus.InTesting;
    public DateTime? StoredAt { get; set; }
    public DateTime? DisposedAt { get; set; }
}
