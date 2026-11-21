using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.HealthScreenings.Commands;
using ClinicEz.Clinic.Application.Features.HealthScreenings.DTOs;
using ClinicEz.Clinic.Application.Features.HealthScreenings.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/health-screenings")]
public sealed class HealthScreeningsController : ControllerBase
{
    private readonly ISender _sender;

    public HealthScreeningsController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    [HasAnyPermission(ClinicPermissions.PatientsRead, ClinicPermissions.TriageRead, ClinicPermissions.ConsultationsRead)]
    public async Task<ActionResult<ApiResponse<List<HealthScreeningDto>>>> GetHealthScreenings(
        [FromQuery] Guid? patientId = null,
        [FromQuery] Guid? queueItemId = null,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetPatientHealthScreeningsQuery(patientId, queueItemId), ct);
        return Ok(ApiResponse<List<HealthScreeningDto>>.Success(result));
    }

    [HttpGet("{id:guid}")]
    [HasAnyPermission(ClinicPermissions.PatientsRead, ClinicPermissions.TriageRead, ClinicPermissions.ConsultationsRead)]
    public async Task<ActionResult<ApiResponse<HealthScreeningDetailDto>>> GetHealthScreeningById(
        Guid id,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetHealthScreeningByIdQuery(id), ct);
        return Ok(ApiResponse<HealthScreeningDetailDto>.Success(result));
    }

    [HttpPost]
    [HasAnyPermission(ClinicPermissions.TriageWrite, ClinicPermissions.ConsultationsWrite, ClinicPermissions.ConsultationsSign)]
    public async Task<ActionResult<ApiResponse<HealthScreeningDetailDto>>> SaveHealthScreeningProgress(
        [FromBody] SaveHealthScreeningProgressRequest request,
        CancellationToken ct = default)
    {
        var command = new SaveHealthScreeningProgressCommand(
            Id: request.Id ?? request.ScreeningId,
            PatientId: request.PatientId,
            QueueItemId: request.QueueItemId,
            ScreeningType: request.ScreeningType,
            WorkflowMode: request.WorkflowMode,
            ServiceItemId: request.ServiceItemId,
            PatientVitalsId: request.PatientVitalsId,
            PatientPhysicalExamId: request.PatientPhysicalExamId,
            NcdRiskAssessmentId: request.NcdRiskAssessmentId,
            NurseScreeningNotes: request.NurseScreeningNotes,
            ClinicalImpression: request.ClinicalImpression,
            PreventiveCounselingNotes: request.PreventiveCounselingNotes,
            RecommendedFollowUpDate: request.RecommendedFollowUpDate,
            AdultsRoutineScreeningCode: request.AdultsRoutineScreeningCode ?? request.AdultRoutineScreeningCode,
            PediatricRoutineScreeningCode: request.PediatricRoutineScreeningCode,
            PrenatalScreeningServicesCode: request.PrenatalScreeningServicesCode,
            BreastCancerScreeningCode: request.BreastCancerScreeningCode,
            CervicalCancerScreeningCode: request.CervicalCancerScreeningCode,
            ColorectalCancerScreeningCode: request.ColorectalCancerScreeningCode,
            ProstateCancerScreeningCode: request.ProstateCancerScreeningCode,
            PhilHealthAtc: request.PhilHealthAtc,
            IsWalkedIn: request.IsWalkedIn,
            ServiceDeliveryMethod: request.ServiceDeliveryMethod,
            FpeClassificationType: request.FpeClassificationType,
            SendToDoctor: request.SendToDoctor,
            ForceSeparateVisit: request.ForceSeparateVisit || request.AllowDuplicateActive);

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<HealthScreeningDetailDto>.Success(result, "Health screening progress saved."));
    }

    [HttpPost("{id:guid}/complete")]
    [HasAnyPermission(ClinicPermissions.TriageWrite, ClinicPermissions.ConsultationsWrite, ClinicPermissions.ConsultationsSign)]
    public async Task<ActionResult<ApiResponse<HealthScreeningDetailDto>>> CompleteHealthScreening(
        Guid id,
        [FromBody] CompleteHealthScreeningRequest request,
        CancellationToken ct = default)
    {
        var command = new CompleteHealthScreeningCommand(
            Id: id,
            Disposition: request.Disposition,
            ClinicalImpression: request.ClinicalImpression,
            PreventiveCounselingNotes: request.PreventiveCounselingNotes,
            RecommendedFollowUpDate: request.RecommendedFollowUpDate,
            PatientVitalsId: request.PatientVitalsId,
            PatientPhysicalExamId: request.PatientPhysicalExamId,
            NcdRiskAssessmentId: request.NcdRiskAssessmentId,
            ServiceItemId: request.ServiceItemId,
            AdultsRoutineScreeningCode: request.AdultsRoutineScreeningCode ?? request.AdultRoutineScreeningCode,
            PediatricRoutineScreeningCode: request.PediatricRoutineScreeningCode,
            PrenatalScreeningServicesCode: request.PrenatalScreeningServicesCode,
            BreastCancerScreeningCode: request.BreastCancerScreeningCode,
            CervicalCancerScreeningCode: request.CervicalCancerScreeningCode,
            ColorectalCancerScreeningCode: request.ColorectalCancerScreeningCode,
            ProstateCancerScreeningCode: request.ProstateCancerScreeningCode,
            PhilHealthAtc: request.PhilHealthAtc,
            IsWalkedIn: request.IsWalkedIn,
            ServiceDeliveryMethod: request.ServiceDeliveryMethod,
            FpeClassificationType: request.FpeClassificationType,
            FacilitatorType: request.FacilitatorType,
            FacilitatorName: request.FacilitatorName,
            HasCoPayment: request.HasCoPayment,
            CoPaymentDate: request.CoPaymentDate,
            CoPaymentAmount: request.CoPaymentAmount,
            CoPaymentBalance: request.CoPaymentBalance);

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<HealthScreeningDetailDto>.Success(result, "Health screening completed."));
    }

    [HttpPost("{id:guid}/escalate")]
    [HasAnyPermission(ClinicPermissions.TriageWrite, ClinicPermissions.ConsultationsWrite, ClinicPermissions.ConsultationsSign)]
    public async Task<ActionResult<ApiResponse<HealthScreeningDetailDto>>> EscalateHealthScreening(
        Guid id,
        [FromBody] EscalateHealthScreeningRequest? request,
        CancellationToken ct = default)
    {
        var command = new EscalateHealthScreeningCommand(
            Id: id,
            Reason: request?.Reason ?? request?.EscalationReason,
            IsUrgent: request?.IsUrgent ?? false,
            DoctorId: request?.DoctorId,
            DoctorName: request?.DoctorName,
            RoomId: request?.RoomId,
            RoomOrStation: request?.RoomOrStation);

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<HealthScreeningDetailDto>.Success(result, "Health screening escalated to physician consultation."));
    }
}

public sealed record SaveHealthScreeningProgressRequest(
    Guid PatientId,
    Guid? Id = null,
    Guid? ScreeningId = null,
    Guid? QueueItemId = null,
    HealthScreeningType ScreeningType = HealthScreeningType.RoutineWellness,
    VisitWorkflowMode WorkflowMode = VisitWorkflowMode.Regular,
    Guid? ServiceItemId = null,
    Guid? PatientVitalsId = null,
    Guid? PatientPhysicalExamId = null,
    Guid? NcdRiskAssessmentId = null,
    string? NurseScreeningNotes = null,
    string? ClinicalImpression = null,
    string? PreventiveCounselingNotes = null,
    DateOnly? RecommendedFollowUpDate = null,
    string? AdultsRoutineScreeningCode = null,
    string? AdultRoutineScreeningCode = null,
    string? PediatricRoutineScreeningCode = null,
    string? PrenatalScreeningServicesCode = null,
    string? BreastCancerScreeningCode = null,
    string? CervicalCancerScreeningCode = null,
    string? ColorectalCancerScreeningCode = null,
    string? ProstateCancerScreeningCode = null,
    string? PhilHealthAtc = null,
    bool? IsWalkedIn = null,
    YakapServiceDeliveryMethod? ServiceDeliveryMethod = null,
    string? FpeClassificationType = null,
    bool SendToDoctor = false,
    bool ForceSeparateVisit = false,
    bool AllowDuplicateActive = false);

public sealed record CompleteHealthScreeningRequest(
    HealthScreeningDisposition Disposition,
    string? ClinicalImpression = null,
    string? PreventiveCounselingNotes = null,
    DateOnly? RecommendedFollowUpDate = null,
    Guid? PatientVitalsId = null,
    Guid? PatientPhysicalExamId = null,
    Guid? NcdRiskAssessmentId = null,
    Guid? ServiceItemId = null,
    string? AdultsRoutineScreeningCode = null,
    string? AdultRoutineScreeningCode = null,
    string? PediatricRoutineScreeningCode = null,
    string? PrenatalScreeningServicesCode = null,
    string? BreastCancerScreeningCode = null,
    string? CervicalCancerScreeningCode = null,
    string? ColorectalCancerScreeningCode = null,
    string? ProstateCancerScreeningCode = null,
    string? PhilHealthAtc = null,
    bool? IsWalkedIn = null,
    YakapServiceDeliveryMethod? ServiceDeliveryMethod = null,
    string? FpeClassificationType = null,
    string? FacilitatorType = null,
    string? FacilitatorName = null,
    bool? HasCoPayment = null,
    DateOnly? CoPaymentDate = null,
    decimal? CoPaymentAmount = null,
    decimal? CoPaymentBalance = null);

public sealed record EscalateHealthScreeningRequest(
    string? Reason = null,
    string? EscalationReason = null,
    bool IsUrgent = false,
    Guid? DoctorId = null,
    string? DoctorName = null,
    Guid? RoomId = null,
    string? RoomOrStation = null);
