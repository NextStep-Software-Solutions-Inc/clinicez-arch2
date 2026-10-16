using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/patients")]
public sealed class PatientsController : ControllerBase
{
    private readonly ISender _sender;

    public PatientsController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    [HasPermission(ClinicPermissions.PatientsRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ClinicPatientDto>>>> GetPatients(
        [FromQuery] string? search,
        [FromQuery] bool? hasAlerts,
        [FromQuery] string? verificationStatus,
        [FromQuery] string? filterMode,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetClinicPatientsQuery(search, hasAlerts, verificationStatus, filterMode, page, pageSize), ct);
        return Ok(ApiResponse<IReadOnlyList<ClinicPatientDto>>.Success(result));
    }

    [HttpGet("check-duplicates")]
    [HasPermission(ClinicPermissions.PatientsRead)]
    public async Task<ActionResult<ApiResponse<DuplicatePatientCheckResultDto>>> CheckDuplicates(
        [FromQuery] string? philHealthNumber,
        [FromQuery] string? contactNumber,
        [FromQuery] string? firstName,
        [FromQuery] string? lastName,
        [FromQuery] DateOnly? dateOfBirth,
        CancellationToken ct)
    {
        var query = new CheckPatientDuplicatesQuery(
            philHealthNumber,
            contactNumber,
            firstName,
            lastName,
            dateOfBirth);

        var result = await _sender.Send(query, ct);
        return Ok(ApiResponse<DuplicatePatientCheckResultDto>.Success(result));
    }

    [HttpGet("{id:guid}")]
    [HasPermission(ClinicPermissions.PatientsRead)]
    public async Task<ActionResult<ApiResponse<ClinicPatientDto>>> GetPatientById(
        Guid id,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetClinicPatientByIdQuery(id), ct);
        if (result == null)
        {
            return NotFound(ApiResponse<ClinicPatientDto>.Fail("Patient not found."));
        }
        return Ok(ApiResponse<ClinicPatientDto>.Success(result));
    }

    [HttpPost]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<ClinicPatientDto>>> RegisterPatient(
        [FromBody] RegisterClinicPatientCommand command,
        CancellationToken ct)
    {
        var result = await _sender.Send(command, ct);
        return CreatedAtAction(nameof(GetPatientById), new { id = result.Id }, ApiResponse<ClinicPatientDto>.Success(result, "Patient registered successfully."));
    }

    /// <summary>Reads a patient's shared record from a scanned share token, or from a ClinicEZ ID plus one-time code. Answered asynchronously: poll the returned id.</summary>
    [HttpPost("share/redeem")]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<PatientShareRedeemAccepted>>> RedeemShare(
        [FromBody] RedeemPatientShareRequest request,
        CancellationToken ct)
    {
        var result = await _sender.Send(
            new RedeemPatientShareCommand(
                request.ShareToken, request.Purpose, request.AddToQueue, request.ChiefComplaint, request.ClinicEzId, request.Code), ct);
        return Accepted(ApiResponse<PatientShareRedeemAccepted>.Success(result, "Share request sent. Waiting for the patient record."));
    }

    [HttpGet("share/{correlationId:guid}")]
    [HasPermission(ClinicPermissions.PatientsRead)]
    public async Task<ActionResult<ApiResponse<ShareImportStatusDto>>> GetShareStatus(
        Guid correlationId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetShareImportStatusQuery(correlationId), ct);
        return Ok(ApiResponse<ShareImportStatusDto>.Success(result));
    }

    [HttpPut("{id:guid}")]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<ClinicPatientDto>>> UpdatePatient(
        Guid id,
        [FromBody] UpdatePatientRequest request,
        CancellationToken ct)
    {
        var command = new UpdateClinicPatientCommand(
            id,
            request.FirstName,
            request.LastName,
            request.MiddleName,
            request.Suffix,
            request.DateOfBirth,
            request.Gender,
            request.CivilStatus,
            request.ContactNumber,
            request.Email,
            request.AddressLine,
            request.Barangay,
            request.City,
            request.Province,
            request.EmergencyContactName,
            request.EmergencyContactPhone,
            request.EmergencyContactRelationship,
            request.PhilHealthNumber,
            request.SeniorCitizenId,
            request.PwdId,
            request.BloodType,
            request.Allergies,
            request.ChronicConditions,
            request.Alerts,
            request.CustomFields,
            request.VerificationStatus,
            request.MedicalHistories);

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ClinicPatientDto>.Success(result, "Patient profile updated successfully."));
    }

    [HttpGet("{id:guid}/chart")]
    [HasPermission(ClinicPermissions.ConsultationsRead)]
    public async Task<ActionResult<ApiResponse<PatientChartDto>>> GetPatientChart(
        Guid id,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetPatientChartQuery(id), ct);
        return Ok(ApiResponse<PatientChartDto>.Success(result));
    }

    [HttpPost("bulk")]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<BulkRegisterPatientsResultDto>>> BulkRegisterPatients(
        [FromBody] BulkRegisterClinicPatientsCommand command,
        CancellationToken ct)
    {
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<BulkRegisterPatientsResultDto>.Success(result, $"Successfully processed {result.SuccessCount} patient records."));
    }

    [HttpPost("public/student-intake")]
    [Microsoft.AspNetCore.Authorization.AllowAnonymous]
    public async Task<ActionResult<ApiResponse<PublicStudentSelfEnrollResultDto>>> PublicStudentSelfEnroll(
        [FromBody] PublicStudentSelfEnrollCommand command,
        CancellationToken ct)
    {
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<PublicStudentSelfEnrollResultDto>.Success(result, result.Message));
    }

    // --- Surgical History Endpoints ---

    [HttpGet("{patientId:guid}/surgical-history")]
    [HasPermission(ClinicPermissions.PatientsRead)]
    public async Task<ActionResult<ApiResponse<List<PatientSurgicalHistoryDto>>>> GetSurgicalHistories(
        Guid patientId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetPatientSurgicalHistoriesQuery(patientId), ct);
        return Ok(ApiResponse<List<PatientSurgicalHistoryDto>>.Success(result));
    }

    [HttpPost("{patientId:guid}/surgical-history")]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<PatientSurgicalHistoryDto>>> AddSurgicalHistory(
        Guid patientId,
        [FromBody] UpsertPatientSurgicalHistoryRequest request,
        CancellationToken ct)
    {
        var command = new AddPatientSurgicalHistoryCommand(
            patientId,
            request.ProcedureName,
            request.SurgeryDate,
            request.HospitalName,
            request.Findings,
            request.Complications,
            request.Remarks);
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<PatientSurgicalHistoryDto>.Success(result, "Surgical procedure recorded successfully."));
    }

    [HttpPut("{patientId:guid}/surgical-history/{id:guid}")]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<PatientSurgicalHistoryDto>>> UpdateSurgicalHistory(
        Guid patientId,
        Guid id,
        [FromBody] UpsertPatientSurgicalHistoryRequest request,
        CancellationToken ct)
    {
        var command = new UpdatePatientSurgicalHistoryCommand(
            id,
            patientId,
            request.ProcedureName,
            request.SurgeryDate,
            request.HospitalName,
            request.Findings,
            request.Complications,
            request.Remarks);
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<PatientSurgicalHistoryDto>.Success(result, "Surgical procedure updated successfully."));
    }

    [HttpDelete("{patientId:guid}/surgical-history/{id:guid}")]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<bool>>> DeleteSurgicalHistory(
        Guid patientId,
        Guid id,
        CancellationToken ct)
    {
        var result = await _sender.Send(new DeletePatientSurgicalHistoryCommand(id, patientId), ct);
        return Ok(ApiResponse<bool>.Success(result, "Surgical procedure deleted."));
    }

    // --- Social History Endpoints ---

    [HttpGet("{patientId:guid}/social-history")]
    [HasPermission(ClinicPermissions.PatientsRead)]
    public async Task<ActionResult<ApiResponse<PatientSocialHistoryDto?>>> GetSocialHistory(
        Guid patientId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetPatientSocialHistoryQuery(patientId), ct);
        return Ok(ApiResponse<PatientSocialHistoryDto?>.Success(result));
    }

    [HttpPut("{patientId:guid}/social-history")]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<PatientSocialHistoryDto>>> UpdateSocialHistory(
        Guid patientId,
        [FromBody] UpdatePatientSocialHistoryRequest request,
        CancellationToken ct)
    {
        var command = new UpdatePatientSocialHistoryCommand(
            patientId,
            request.IsSmoker,
            request.PacksPerDay,
            request.CigarettesPerDay,
            request.YearsSmoking,
            request.SmokingPackYears,
            request.SmokingStoppedDate,
            request.IsAlcoholDrinker,
            request.AlcoholDrinksPerWeek,
            request.AlcoholBottlesPerDay,
            request.AlcoholFrequency,
            request.UsesIllicitDrugs,
            request.SubstanceUseHistory,
            request.DrugTypes,
            request.IsSexuallyActive,
            request.CoitarcheAge,
            request.PhysicalActivityFrequency,
            request.DietaryHabits,
            request.Remarks,
            request.SmokingStatus,
            request.AlcoholStatus);
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<PatientSocialHistoryDto>.Success(result, "Social history updated successfully."));
    }


    // --- Past Medical History Endpoints ---

    [HttpGet("{patientId:guid}/medical-history")]
    [HasPermission(ClinicPermissions.PatientsRead)]
    public async Task<ActionResult<ApiResponse<PatientMedicalHistoryResultDto>>> GetMedicalHistory(
        Guid patientId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetPatientMedicalHistoryQuery(patientId), ct);
        return Ok(ApiResponse<PatientMedicalHistoryResultDto>.Success(result));
    }

    [HttpPut("{patientId:guid}/medical-history")]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<PatientMedicalHistoryResultDto>>> UpdateMedicalHistory(
        Guid patientId,
        [FromBody] SavePatientMedicalHistoriesRequest request,
        CancellationToken ct)
    {
        var command = new SavePatientMedicalHistoriesCommand(patientId, request.Items, request.Notes);
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<PatientMedicalHistoryResultDto>.Success(result, "Past medical history updated successfully."));
    }

    // --- Family Medical History Endpoints ---

    [HttpGet("{patientId:guid}/family-history")]
    [HasPermission(ClinicPermissions.PatientsRead)]
    public async Task<ActionResult<ApiResponse<PatientFamilyHistoryResultDto>>> GetFamilyHistory(
        Guid patientId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetPatientFamilyHistoryQuery(patientId), ct);
        return Ok(ApiResponse<PatientFamilyHistoryResultDto>.Success(result));
    }

    [HttpPut("{patientId:guid}/family-history")]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<PatientFamilyHistoryResultDto>>> UpdateFamilyHistory(
        Guid patientId,
        [FromBody] SavePatientFamilyHistoriesRequest request,
        CancellationToken ct)
    {
        var command = new SavePatientFamilyHistoriesCommand(patientId, request.Items, request.Notes);
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<PatientFamilyHistoryResultDto>.Success(result, "Family medical history updated successfully."));
    }

    // --- Reproductive History Endpoints ---

    [HttpGet("{patientId:guid}/reproductive-history")]
    [HasPermission(ClinicPermissions.PatientsRead)]
    public async Task<ActionResult<ApiResponse<PatientReproductiveHistoryDto?>>> GetReproductiveHistory(
        Guid patientId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetPatientReproductiveHistoryQuery(patientId), ct);
        return Ok(ApiResponse<PatientReproductiveHistoryDto?>.Success(result));
    }

    [HttpPut("{patientId:guid}/reproductive-history")]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<PatientReproductiveHistoryDto>>> UpdateReproductiveHistory(
        Guid patientId,
        [FromBody] UpdatePatientReproductiveHistoryRequest request,
        CancellationToken ct)
    {
        var command = new UpdatePatientReproductiveHistoryCommand(
            patientId,
            request.IsApplicable,
            request.MenarcheAge,
            request.LastMenstrualPeriod,
            request.PeriodDurationDays,
            request.CycleIntervalDays,
            request.PadsPerDay,
            request.IsMenopausal,
            request.MenopauseAge,
            request.ContraceptiveMethod,
            request.Gravidity,
            request.Parity,
            request.TermBirths,
            request.PretermBirths,
            request.Abortions,
            request.LivingChildren,
            request.DeliveryType,
            request.HadPreEclampsiaHypertension,
            request.ReceivedFamilyPlanningCounseling,
            request.Remarks);
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<PatientReproductiveHistoryDto>.Success(result, "Reproductive health profile updated."));
    }

    // --- NCD Risk Assessment Endpoints ---

    [HttpGet("{patientId:guid}/ncd-risk-assessment")]
    [HasPermission(ClinicPermissions.PatientsRead)]
    public async Task<ActionResult<ApiResponse<List<NcdRiskAssessmentDto>>>> GetNcdRiskAssessments(
        Guid patientId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetPatientNcdRiskAssessmentsQuery(patientId), ct);
        return Ok(ApiResponse<List<NcdRiskAssessmentDto>>.Success(result));
    }

    [HttpPost("{patientId:guid}/ncd-risk-assessment")]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<NcdRiskAssessmentDto>>> SaveNcdRiskAssessment(
        Guid patientId,
        [FromBody] SaveNcdRiskAssessmentRequest request,
        CancellationToken ct)
    {
        var command = new SaveNcdRiskAssessmentCommand(
            patientId,
            request.ConsultationEncounterId,
            request.AssessedByStaffId,
            request.AssessedByStaffName,
            request.EatsProcessedFoodWeekly,
            request.ThreeServingsVegetablesDaily,
            request.TwoToThreeServingsFruitDaily,
            request.PhysicalActivityAtLeast150MinsWeekly,
            request.DiagnosedDiabetes,
            request.HasPolyphagia,
            request.HasPolydipsia,
            request.HasPolyuria,
            request.DiabetesMedicationStatus,
            request.HasRaisedBloodGlucose,
            request.FastingBloodSugarMgDl,
            request.FastingBloodSugarMmolL,
            request.FastingBloodSugarDate,
            request.HasChestPain,
            request.PainInCenterOfChestOrLeftArm,
            request.PainWhenWalkingUphill,
            request.SlowsDownWhenPainOccurs,
            request.PainRelievedWithin10Mins,
            request.PainRelievedByNitrates,
            request.SevereChestPainOver30Mins,
            request.TransientNeurologicalDeficits,
            request.HasRaisedBloodLipids,
            request.TotalCholesterolMgDl,
            request.TotalCholesterolDate,
            request.HasHistoryAnginaHeartAttack,
            request.HasHistoryStrokeOrTia,
            request.UrineKetonesPresent,
            request.UrineKetonesValue,
            request.UrineKetonesDate,
            request.UrineProteinPresent,
            request.UrineProteinValue,
            request.UrineProteinDate,
            request.RiskBand,
            request.CalculatedRiskScorePercent,
            request.Remarks,
            request.AssessmentDate);
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<NcdRiskAssessmentDto>.Success(result, "NCD risk assessment recorded successfully."));
    }

    // --- Pediatric WHO Z-Score Calculation Endpoint ---

    [HttpPost("calculate-zscore")]
    [HasPermission(ClinicPermissions.PatientsRead)]
    public async Task<ActionResult<ApiResponse<PediatricZScoreDto?>>> CalculateZScore(
        [FromBody] CalculatePediatricZScoreRequest request,
        CancellationToken ct)
    {
        var query = new CalculatePediatricZScoreQuery(
            request.DateOfBirth,
            request.Gender,
            request.LengthOrHeightCm,
            request.WeightKg,
            request.IsMeasuredRecumbent,
            request.AssessmentDate);
        var result = await _sender.Send(query, ct);
        return Ok(ApiResponse<PediatricZScoreDto?>.Success(result));
    }

    // --- Physical Examination Endpoints ---

    [HttpGet("{patientId:guid}/physical-exam")]
    [HasPermission(ClinicPermissions.PatientsRead)]
    public async Task<ActionResult<ApiResponse<PatientPhysicalExamProfileDto>>> GetPhysicalExam(
        Guid patientId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetPatientPhysicalExamQuery(patientId), ct);
        return Ok(ApiResponse<PatientPhysicalExamProfileDto>.Success(result));
    }

    [HttpPut("{patientId:guid}/physical-exam")]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<PatientPhysicalExamProfileDto>>> UpdatePhysicalExam(
        Guid patientId,
        [FromBody] UpdatePatientPhysicalExamRequest request,
        CancellationToken ct)
    {
        var command = new UpdatePatientPhysicalExamCommand(
            patientId,
            request.GenSurveyId,
            request.GenSurveyRemarks,
            request.SkinId,
            request.SkinRemarks,
            request.HeentId,
            request.HeentRemarks,
            request.ChestId,
            request.ChestRemarks,
            request.HeartId,
            request.HeartRemarks,
            request.AbdomenId,
            request.AbdomenRemarks,
            request.NeuroId,
            request.NeuroRemarks,
            request.RectalId,
            request.RectalRemarks,
            request.GuId,
            request.GuRemarks);

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<PatientPhysicalExamProfileDto>.Success(result, "Physical examination findings updated successfully."));
    }
}

public sealed record UpdatePatientRequest(
    string FirstName,
    string LastName,
    string? MiddleName,
    string? Suffix,
    DateOnly DateOfBirth,
    string Gender,
    string? CivilStatus,
    string ContactNumber,
    string? Email,
    string? AddressLine,
    string? Barangay,
    string? City,
    string? Province,
    string? EmergencyContactName,
    string? EmergencyContactPhone,
    string? EmergencyContactRelationship,
    string? PhilHealthNumber,
    string? SeniorCitizenId,
    string? PwdId,
    string? BloodType,
    string? Allergies,
    string? ChronicConditions,
    string? Alerts,
    System.Collections.Generic.Dictionary<string, object?>? CustomFields = null,
    string? VerificationStatus = null,
    List<MedicalHistoryEntryDto>? MedicalHistories = null);
