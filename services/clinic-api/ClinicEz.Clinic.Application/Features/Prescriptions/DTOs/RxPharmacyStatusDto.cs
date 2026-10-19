using System;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;

/// <summary>
/// Where a prescription stands at the pharmacy, as last reported by it (<c>rx.status.changed</c>): the stage name, why it was
/// rejected, what it was quoted at and which pharmacy holds it. <c>Issued</c> until a pharmacy says otherwise.
/// </summary>
public sealed record RxPharmacyStatusDto(
    string Stage,
    string? Reason,
    decimal? QuotedAmount,
    string? PharmacyName,
    DateTime? ReportedAt)
{
    public static RxPharmacyStatusDto From(ConsultationEncounter encounter) => new(
        encounter.RxStage.ToString(),
        encounter.RxStageReason,
        encounter.RxQuotedAmount,
        encounter.RxPharmacyName,
        encounter.RxStageReportedAt);
}
