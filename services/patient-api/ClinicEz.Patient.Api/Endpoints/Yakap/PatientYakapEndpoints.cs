using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Features.Yakap.DTOs;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Common;

namespace ClinicEz.Patient.Api.Endpoints.Yakap;

public sealed class PatientYakapEndpoints : IEndpoint
{
    private const decimal ExpandedGamotAnnualAllocation = 20000.00m; // PHP 20,000.00

    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/patients/{id:guid}/yakap")
            .WithTags("PhilHealth Yakap & GAMOT")
            .RequireAuthorization();

        group.MapGet("/profile", GetYakapProfile)
            .WithName("GetPatientYakapProfile")
            .WithSummary("Retrieve patient's PhilHealth Yakap status, assigned clinic, and GAMOT benefit balance")
            .Produces<ApiResponse<PatientYakapProfileDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound);

        group.MapGet("/ncd", GetNcdQuestionnaire)
            .WithName("GetPatientNcdQuestionnaire")
            .WithSummary("Retrieve patient's 24-item PhilHealth NCD risk assessment answers")
            .Produces<ApiResponse<PatientNcdQuestionnaireDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound);

        group.MapPut("/ncd", UpdateNcdQuestionnaire)
            .WithName("UpdatePatientNcdQuestionnaire")
            .WithSummary("Save or update patient's 24-item PhilHealth NCD risk assessment answers")
            .Produces<ApiResponse<PatientNcdQuestionnaireDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound);
    }

    private static async Task<IResult> GetYakapProfile(
        Guid id,
        ApplicationDbContext db,
        CancellationToken ct)
    {
        var patient = await db.Patients
            .Include(p => p.GovernmentIds)
            .Include(p => p.ClinicMemberships)
                .ThenInclude(m => m.Clinic)
            .Include(p => p.NcdQuestionnaire)
            .FirstOrDefaultAsync(p => p.Id == id, ct);

        if (patient == null)
        {
            return Results.NotFound(ApiResponse<object>.Fail("Patient was not found."));
        }

        // Find PhilHealth ID
        var philhealthGovId = patient.GovernmentIds
            .FirstOrDefault(g => g.IdType == GovernmentIdType.PhilHealth);

        var pin = philhealthGovId?.IdNumber;
        var cleanPin = pin != null ? new string(pin.Where(char.IsDigit).ToArray()).PadLeft(12, '0') : null;
        var isPinValid = cleanPin != null && ValidateModulus11(cleanPin);

        var activeMembership = patient.ClinicMemberships
            .FirstOrDefault(m => m.Status == ClinicMembershipStatus.Active);

        var hasNcd = patient.NcdQuestionnaire != null &&
            (!string.IsNullOrEmpty(patient.NcdQuestionnaire.Qid1Yn) || !string.IsNullOrEmpty(patient.NcdQuestionnaire.Qid2Yn));

        var dto = new PatientYakapProfileDto(
            PatientId: patient.Id,
            PhilHealthIdentificationNumber: cleanPin,
            IsPinValid: isPinValid,
            PhilHealthCategory: philhealthGovId?.PhilhealthCategory ?? "MM",
            AssignedClinicName: activeMembership?.Clinic?.Name ?? "Metro Health Outpatient Clinic",
            AssignedClinicId: activeMembership?.ClinicId,
            AnnualAllocation: ExpandedGamotAnnualAllocation,
            TotalAmountUtilized: 0.00m,
            RemainingBalance: ExpandedGamotAnnualAllocation,
            HasCompletedNcdSurvey: hasNcd,
            NcdSurveyLastUpdated: patient.NcdQuestionnaire?.UpdatedAt ?? patient.NcdQuestionnaire?.CreatedAt);

        return Results.Ok(ApiResponse<PatientYakapProfileDto>.Success(dto));
    }

    private static async Task<IResult> GetNcdQuestionnaire(
        Guid id,
        ApplicationDbContext db,
        CancellationToken ct)
    {
        var ncd = await db.PatientNcdQuestionnaires
            .FirstOrDefaultAsync(n => n.PatientId == id, ct);

        if (ncd == null)
        {
            var empty = new PatientNcdQuestionnaireDto(
                id, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
            return Results.Ok(ApiResponse<PatientNcdQuestionnaireDto>.Success(empty));
        }

        var dto = new PatientNcdQuestionnaireDto(
            ncd.PatientId,
            ncd.Qid1Yn,
            ncd.Qid2Yn,
            ncd.Qid3Yn,
            ncd.Qid4Yn,
            ncd.Qid5Ynx,
            ncd.Qid6Yn,
            ncd.Qid7Yn,
            ncd.Qid8Yn,
            ncd.Qid9Yn,
            ncd.Qid10Yn,
            ncd.Qid11Yn,
            ncd.Qid12Yn,
            ncd.Qid13Yn,
            ncd.Qid14Yn,
            ncd.Qid15Yn,
            ncd.Qid16Yn,
            ncd.Qid17Abcde,
            ncd.Qid18Yn,
            ncd.Qid19Yn,
            ncd.Qid19FbsMgdl,
            ncd.Qid19FbsMmol,
            ncd.Qid19FbsDate?.ToString("yyyy-MM-dd"),
            ncd.Qid20Yn,
            ncd.Qid20CholeVal,
            ncd.Qid20CholeDate?.ToString("yyyy-MM-dd"),
            ncd.Qid21Yn,
            ncd.Qid21KetonVal,
            ncd.Qid21KetonDate?.ToString("yyyy-MM-dd"),
            ncd.Qid22Yn,
            ncd.Qid22ProteinVal,
            ncd.Qid22ProteinDate?.ToString("yyyy-MM-dd"),
            ncd.Qid23Yn,
            ncd.Qid24Yn,
            ncd.SyncedAt);

        return Results.Ok(ApiResponse<PatientNcdQuestionnaireDto>.Success(dto));
    }

    private static async Task<IResult> UpdateNcdQuestionnaire(
        Guid id,
        UpdatePatientNcdQuestionnaireRequest request,
        ApplicationDbContext db,
        CancellationToken ct)
    {
        var patientExists = await db.Patients.AnyAsync(p => p.Id == id, ct);
        if (!patientExists)
        {
            return Results.NotFound(ApiResponse<object>.Fail("Patient was not found."));
        }

        var ncd = await db.PatientNcdQuestionnaires
            .FirstOrDefaultAsync(n => n.PatientId == id, ct);

        if (ncd == null)
        {
            ncd = new PatientNcdQuestionnaire
            {
                Id = Guid.NewGuid(),
                PatientId = id,
            };
            await db.PatientNcdQuestionnaires.AddAsync(ncd, ct);
        }

        ncd.Qid1Yn = request.Qid1Yn;
        ncd.Qid2Yn = request.Qid2Yn;
        ncd.Qid3Yn = request.Qid3Yn;
        ncd.Qid4Yn = request.Qid4Yn;
        ncd.Qid5Ynx = request.Qid5Ynx;
        ncd.Qid6Yn = request.Qid6Yn;
        ncd.Qid7Yn = request.Qid7Yn;
        ncd.Qid8Yn = request.Qid8Yn;
        ncd.Qid9Yn = request.Qid9Yn;
        ncd.Qid10Yn = request.Qid10Yn;
        ncd.Qid11Yn = request.Qid11Yn;
        ncd.Qid12Yn = request.Qid12Yn;
        ncd.Qid13Yn = request.Qid13Yn;
        ncd.Qid14Yn = request.Qid14Yn;
        ncd.Qid15Yn = request.Qid15Yn;
        ncd.Qid16Yn = request.Qid16Yn;
        ncd.Qid17Abcde = request.Qid17Abcde;
        ncd.Qid18Yn = request.Qid18Yn;

        ncd.Qid19Yn = request.Qid19Yn;
        ncd.Qid19FbsMgdl = request.Qid19FbsMgdl;
        ncd.Qid19FbsMmol = request.Qid19FbsMmol ?? (request.Qid19FbsMgdl.HasValue ? Math.Round(request.Qid19FbsMgdl.Value / 18.0182m, 2) : null);
        ncd.Qid19FbsDate = DateOnly.TryParse(request.Qid19FbsDate, out var fbsD) ? fbsD : null;

        ncd.Qid20Yn = request.Qid20Yn;
        ncd.Qid20CholeVal = request.Qid20CholeVal;
        ncd.Qid20CholeDate = DateOnly.TryParse(request.Qid20CholeDate, out var cholD) ? cholD : null;

        ncd.Qid21Yn = request.Qid21Yn;
        ncd.Qid21KetonVal = request.Qid21KetonVal;
        ncd.Qid21KetonDate = DateOnly.TryParse(request.Qid21KetonDate, out var ketD) ? ketD : null;

        ncd.Qid22Yn = request.Qid22Yn;
        ncd.Qid22ProteinVal = request.Qid22ProteinVal;
        ncd.Qid22ProteinDate = DateOnly.TryParse(request.Qid22ProteinDate, out var protD) ? protD : null;

        ncd.Qid23Yn = request.Qid23Yn;
        ncd.Qid24Yn = request.Qid24Yn;
        ncd.SyncedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);

        var dto = new PatientNcdQuestionnaireDto(
            ncd.PatientId,
            ncd.Qid1Yn,
            ncd.Qid2Yn,
            ncd.Qid3Yn,
            ncd.Qid4Yn,
            ncd.Qid5Ynx,
            ncd.Qid6Yn,
            ncd.Qid7Yn,
            ncd.Qid8Yn,
            ncd.Qid9Yn,
            ncd.Qid10Yn,
            ncd.Qid11Yn,
            ncd.Qid12Yn,
            ncd.Qid13Yn,
            ncd.Qid14Yn,
            ncd.Qid15Yn,
            ncd.Qid16Yn,
            ncd.Qid17Abcde,
            ncd.Qid18Yn,
            ncd.Qid19Yn,
            ncd.Qid19FbsMgdl,
            ncd.Qid19FbsMmol,
            ncd.Qid19FbsDate?.ToString("yyyy-MM-dd"),
            ncd.Qid20Yn,
            ncd.Qid20CholeVal,
            ncd.Qid20CholeDate?.ToString("yyyy-MM-dd"),
            ncd.Qid21Yn,
            ncd.Qid21KetonVal,
            ncd.Qid21KetonDate?.ToString("yyyy-MM-dd"),
            ncd.Qid22Yn,
            ncd.Qid22ProteinVal,
            ncd.Qid22ProteinDate?.ToString("yyyy-MM-dd"),
            ncd.Qid23Yn,
            ncd.Qid24Yn,
            ncd.SyncedAt);

        return Results.Ok(ApiResponse<PatientNcdQuestionnaireDto>.Success(dto, "NCD questionnaire responses successfully saved."));
    }

    private static bool ValidateModulus11(string pin)
    {
        if (pin.Length != 12 || !pin.All(char.IsDigit)) return false;
        int[] weights = [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
        int sum = 0;
        for (int i = 0; i < 11; i++)
        {
            sum += (pin[i] - '0') * weights[i];
        }
        int remainder = sum % 11;
        int checkDigit = (11 - remainder) % 11;
        return (pin[11] - '0') == checkDigit;
    }
}
