using System;
using System.Collections.Generic;
using ClinicEz.Laboratory.Domain.Common;
using ClinicEz.Laboratory.Domain.Enums;

namespace ClinicEz.Laboratory.Domain.Entities;

public sealed class QcLot : BaseEntity, ILabScopedEntity
{
    public required string TenantId { get; set; }
    public Guid LaboratoryId { get; set; }
    public required string LotNumber { get; set; }
    public required string ControlName { get; set; }
    public ControlLevel Level { get; set; } = ControlLevel.Level2_Normal;
    public required string AnalyteCode { get; set; }
    public string InstrumentName { get; set; } = string.Empty;
    public double TargetMean { get; set; }
    public double TargetStandardDeviation { get; set; }
    public DateTime ManufacturerExpirationDate { get; set; }
    public DateTime? OpenVialDate { get; set; }
    public int OpenVialStabilityDays { get; set; } = 30;
    public bool IsActive { get; set; } = true;

    public List<QcRun> Runs { get; set; } = new();

    public DateTime? GetOpenVialExpirationDate()
    {
        return OpenVialDate?.AddDays(OpenVialStabilityDays);
    }

    public bool IsExpired(DateTime currentTime)
    {
        if (currentTime > ManufacturerExpirationDate)
            return true;

        var openExpiry = GetOpenVialExpirationDate();
        if (openExpiry.HasValue && currentTime > openExpiry.Value)
            return true;

        return false;
    }
}
