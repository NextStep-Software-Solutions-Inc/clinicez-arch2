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
}
