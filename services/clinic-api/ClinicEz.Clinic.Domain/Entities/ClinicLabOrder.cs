using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class ClinicLabOrder : BaseEntity
{
    public string? TenantId { get; set; }
    public Guid ClinicId { get; set; }

    public required string OrderNumber { get; set; }
    public Guid PatientId { get; set; }
    public required string PatientName { get; set; }
    public Guid? ConsultationId { get; set; }

    public Guid? OrderedByDoctorId { get; set; }
    public string? OrderedByDoctorName { get; set; }
    public DateTime OrderDate { get; set; } = DateTime.UtcNow;

    public LabOrderStatus Status { get; set; } = LabOrderStatus.Ordered;
    public string? ClinicalDiagnosis { get; set; }
    public string? Notes { get; set; }

    public List<ClinicLabOrderItem> Items { get; set; } = new();
}

public sealed class ClinicLabOrderItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid LabOrderId { get; set; }
    public required string TestName { get; set; }
    public required string Category { get; set; }
    public string? Instructions { get; set; }
    public LabOrderStatus Status { get; set; } = LabOrderStatus.Ordered;
}
