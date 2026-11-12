using System;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Features.Dispensing.DTOs;

public sealed record TriageDispensedItemInput(
    string ItemName,
    string? ItemCategory = "Medicine",
    string? DosageOrSpec = null,
    string FormOrUnit = "Piece",
    int QuantityDispensed = 1,
    string? DirectionsOrInstructions = null,
    string? RosCategory = null,
    Guid? Id = null);

public sealed record ClinicDispensingLogDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    Guid PatientId,
    string PatientName,
    Guid QueueItemId,
    string? QueueNumber,
    string? VisitType,
    string Source,
    Guid? ConsultationEncounterId,
    Guid? PrescriptionItemId,
    Guid? PatientVitalsId,
    string ItemName,
    string ItemCategory,
    string? DosageOrSpec,
    string FormOrUnit,
    int QuantityDispensed,
    string? DirectionsOrInstructions,
    string RosCategory,
    string RosCategoryLabel,
    bool IsConsultationValidated,
    Guid? DispensedByStaffId,
    string DispensedByStaffName,
    string DispensedByRole,
    DateTime DispensedAt,
    string? ChiefComplaint = null,
    string? VitalsSummary = null,
    string? PreAssessmentNotes = null,
    string? HomeInstructions = null,
    bool RequiresDoctorReview = false,
    Guid? ReviewedByDoctorId = null,
    string? ReviewedByDoctorName = null,
    DateTime? ReviewedAt = null,
    string? DoctorReviewNotes = null,
    bool InterventionFlagged = false);

public static class ClinicDispensingLogMapper
{
    public static ClinicDispensingLogDto ToDto(
        ClinicDispensingLog log,
        QueueItem? queueItem = null,
        PatientVitals? vitals = null)
    {
        return new ClinicDispensingLogDto(
            log.Id,
            log.TenantId,
            log.ClinicId,
            log.PatientId,
            log.PatientName,
            log.QueueItemId,
            queueItem?.QueueNumber,
            queueItem?.VisitType.ToString(),
            log.Source.ToString(),
            log.ConsultationEncounterId,
            log.PrescriptionItemId,
            log.PatientVitalsId,
            log.ItemName,
            log.ItemCategory.ToString(),
            log.DosageOrSpec,
            log.FormOrUnit,
            log.QuantityDispensed,
            log.DirectionsOrInstructions,
            log.RosCategory.ToString(),
            RosCategoryHelper.ToDisplayLabel(log.RosCategory),
            log.IsConsultationValidated,
            log.DispensedByStaffId,
            log.DispensedByStaffName,
            log.DispensedByRole,
            log.DispensedAt,
            queueItem?.ChiefComplaint,
            QueueItemMappingExtensions.FormatVitalsSummary(vitals),
            vitals?.PreAssessmentNotes ?? vitals?.Notes,
            vitals?.HomeInstructions,
            log.RequiresDoctorReview,
            log.ReviewedByDoctorId,
            log.ReviewedByDoctorName,
            log.ReviewedAt,
            log.DoctorReviewNotes,
            log.InterventionFlagged);
    }
}
