using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Common;

namespace ClinicEz.Patient.Api.Endpoints.Patients;

public sealed record UpdateSocialHistoryRequest(
    string? SmokingStatus,
    int? CigsPerDay,
    decimal? PackYears,
    DateOnly? QuitDate,
    string? OtherTobaccoProducts,
    string? AlcoholUse,
    string? AlcoholType,
    int? AlcoholFrequencyDaysPerWeek,
    int? AlcoholQuantityPerOccasion,
    bool UsesSubstances,
    string? SubstanceName,
    string? SubstanceRoute,
    string? SubstanceFrequency,
    string? ActivityLevel,
    string? ExerciseType,
    int? ExerciseFrequencyDaysPerWeek,
    string? DietPattern,
    string? FoodRestrictions,
    decimal? SleepAvgHours,
    string? SleepQuality,
    bool? IsSexuallyActive,
    string? WaterIntake,
    string? OccupationalHazards);

public sealed record UpdateOccupationRequest(
    string? Occupation,
    string? Employer,
    string? Industry,
    string? WorkEnvironment,
    int? YearsInOccupation,
    string? HazardExposure);

public sealed record UpdateObstetricProfileRequest(
    int? Gravida,
    int? Para,
    int? AbortusCount,
    int? LivingChildren,
    DateOnly? LastMenstrualPeriod,
    DateOnly? Menarche,
    bool IsPregnant,
    int? MenstrualCycleLengthDays,
    bool HasDysmenorrhea,
    string? Notes);

public sealed record UpdateMaleReproductiveRequest(
    bool HasVasectomy,
    DateOnly? VasectomyDate,
    string? Conditions);

public sealed record UpdateDentalVisionRequest(
    string? DentistName,
    string? DentistClinic,
    string? OrthodonticDevice,
    string? EyeDoctorName,
    string? CorrectiveLenses);

public sealed record UpdateMentalHealthRequest(
    bool HasDiagnosis,
    string? DiagnosisName,
    bool IsOnMedication,
    string? MedicationName,
    string? TherapistName,
    string? TherapyType,
    string? SessionFrequency,
    string? Notes);

public sealed class PatientProfilesEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/patients/{id:guid}")
            .WithTags("Patients - Profile Sections");

        // ── Social History ───────────────────────────────────────────────────
        group.MapGet("/social-history", GetSocialHistory)
            .WithName("GetPatientSocialHistory")
            .Produces<ApiResponse<PatientSocialHistoryDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();

        group.MapPut("/social-history", UpdateSocialHistory)
            .WithName("UpdatePatientSocialHistory")
            .Produces<ApiResponse<PatientSocialHistoryDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();

        // ── Occupation ───────────────────────────────────────────────────────
        group.MapGet("/occupation", GetOccupation)
            .WithName("GetPatientOccupation")
            .Produces<ApiResponse<PatientOccupationDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();

        group.MapPut("/occupation", UpdateOccupation)
            .WithName("UpdatePatientOccupation")
            .Produces<ApiResponse<PatientOccupationDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();

        // ── Obstetric Profile ────────────────────────────────────────────────
        group.MapGet("/obstetric-profile", GetObstetricProfile)
            .WithName("GetPatientObstetricProfile")
            .Produces<ApiResponse<PatientObstetricProfileDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();

        group.MapPut("/obstetric-profile", UpdateObstetricProfile)
            .WithName("UpdatePatientObstetricProfile")
            .Produces<ApiResponse<PatientObstetricProfileDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();

        // ── Male Reproductive ────────────────────────────────────────────────
        group.MapGet("/male-reproductive", GetMaleReproductive)
            .WithName("GetPatientMaleReproductive")
            .Produces<ApiResponse<PatientMaleReproductiveDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();

        group.MapPut("/male-reproductive", UpdateMaleReproductive)
            .WithName("UpdatePatientMaleReproductive")
            .Produces<ApiResponse<PatientMaleReproductiveDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();

        // ── Dental & Vision ──────────────────────────────────────────────────
        group.MapGet("/dental-vision", GetDentalVision)
            .WithName("GetPatientDentalVision")
            .Produces<ApiResponse<PatientDentalVisionDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();

        group.MapPut("/dental-vision", UpdateDentalVision)
            .WithName("UpdatePatientDentalVision")
            .Produces<ApiResponse<PatientDentalVisionDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();

        // ── Mental Health ────────────────────────────────────────────────────
        group.MapGet("/mental-health", GetMentalHealth)
            .WithName("GetPatientMentalHealth")
            .Produces<ApiResponse<PatientMentalHealthProfileDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();

        group.MapPut("/mental-health", UpdateMentalHealth)
            .WithName("UpdatePatientMentalHealth")
            .Produces<ApiResponse<PatientMentalHealthProfileDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }

    // ── Handlers ─────────────────────────────────────────────────────────────

    private static async Task<IResult> GetSocialHistory(Guid id, ApplicationDbContext db, CancellationToken ct)
    {
        var row = await db.PatientSocialHistories.FirstOrDefaultAsync(s => s.PatientId == id, ct);
        if (row is null) return Results.NotFound(ApiResponse<object>.Fail("Social history not found."));

        return Results.Ok(ApiResponse<PatientSocialHistoryDto>.Success(new PatientSocialHistoryDto(
            row.Id, row.ClientId, row.SmokingStatus?.ToString(), row.CigsPerDay, row.PackYears,
            row.QuitDate, row.OtherTobaccoProducts, row.AlcoholUse?.ToString(), row.AlcoholType,
            row.AlcoholFrequencyDaysPerWeek, row.AlcoholQuantityPerOccasion, row.UsesSubstances,
            row.SubstanceName, row.SubstanceRoute, row.SubstanceFrequency, row.ActivityLevel?.ToString(),
            row.ExerciseType, row.ExerciseFrequencyDaysPerWeek, row.DietPattern, row.FoodRestrictions,
            row.SleepAvgHours, row.SleepQuality?.ToString(), row.IsSexuallyActive, row.WaterIntake,
            row.OccupationalHazards, row.UpdatedAt)));
    }

    private static async Task<IResult> UpdateSocialHistory(Guid id, UpdateSocialHistoryRequest req, ApplicationDbContext db, CancellationToken ct)
    {
        var patientExists = await db.Patients.AnyAsync(p => p.Id == id, ct);
        if (!patientExists) return Results.NotFound(ApiResponse<object>.Fail($"Patient '{id}' was not found."));

        var row = await db.PatientSocialHistories.FirstOrDefaultAsync(s => s.PatientId == id, ct);
        var now = DateTime.UtcNow;

        if (row is null)
        {
            row = new PatientSocialHistory { PatientId = id, ClientId = Guid.NewGuid(), CreatedAt = now };
            await db.PatientSocialHistories.AddAsync(row, ct);
        }

        row.SmokingStatus = Enum.TryParse<SmokingStatus>(req.SmokingStatus, true, out var ss) ? ss : null;
        row.CigsPerDay = req.CigsPerDay;
        row.PackYears = req.PackYears;
        row.QuitDate = req.QuitDate;
        row.OtherTobaccoProducts = req.OtherTobaccoProducts;
        row.AlcoholUse = Enum.TryParse<AlcoholUse>(req.AlcoholUse, true, out var au) ? au : null;
        row.AlcoholType = req.AlcoholType;
        row.AlcoholFrequencyDaysPerWeek = req.AlcoholFrequencyDaysPerWeek;
        row.AlcoholQuantityPerOccasion = req.AlcoholQuantityPerOccasion;
        row.UsesSubstances = req.UsesSubstances;
        row.SubstanceName = req.SubstanceName;
        row.SubstanceRoute = req.SubstanceRoute;
        row.SubstanceFrequency = req.SubstanceFrequency;
        row.ActivityLevel = Enum.TryParse<ActivityLevel>(req.ActivityLevel, true, out var al) ? al : null;
        row.ExerciseType = req.ExerciseType;
        row.ExerciseFrequencyDaysPerWeek = req.ExerciseFrequencyDaysPerWeek;
        row.DietPattern = req.DietPattern;
        row.FoodRestrictions = req.FoodRestrictions;
        row.SleepAvgHours = req.SleepAvgHours;
        row.SleepQuality = Enum.TryParse<SleepQuality>(req.SleepQuality, true, out var sq) ? sq : null;
        row.IsSexuallyActive = req.IsSexuallyActive;
        row.WaterIntake = req.WaterIntake;
        row.OccupationalHazards = req.OccupationalHazards;
        row.UpdatedAt = now;

        await db.SaveChangesAsync(ct);

        return Results.Ok(ApiResponse<PatientSocialHistoryDto>.Success(new PatientSocialHistoryDto(
            row.Id, row.ClientId, row.SmokingStatus?.ToString(), row.CigsPerDay, row.PackYears,
            row.QuitDate, row.OtherTobaccoProducts, row.AlcoholUse?.ToString(), row.AlcoholType,
            row.AlcoholFrequencyDaysPerWeek, row.AlcoholQuantityPerOccasion, row.UsesSubstances,
            row.SubstanceName, row.SubstanceRoute, row.SubstanceFrequency, row.ActivityLevel?.ToString(),
            row.ExerciseType, row.ExerciseFrequencyDaysPerWeek, row.DietPattern, row.FoodRestrictions,
            row.SleepAvgHours, row.SleepQuality?.ToString(), row.IsSexuallyActive, row.WaterIntake,
            row.OccupationalHazards, row.UpdatedAt), "Social history updated successfully."));
    }

    private static async Task<IResult> GetOccupation(Guid id, ApplicationDbContext db, CancellationToken ct)
    {
        var row = await db.PatientOccupations.FirstOrDefaultAsync(o => o.PatientId == id, ct);
        if (row is null) return Results.NotFound(ApiResponse<object>.Fail("Occupation not found."));

        return Results.Ok(ApiResponse<PatientOccupationDto>.Success(new PatientOccupationDto(
            row.Id, row.ClientId, row.Occupation, row.Employer, row.Industry,
            row.WorkEnvironment?.ToString(), row.YearsInOccupation, row.HazardExposure, row.UpdatedAt)));
    }

    private static async Task<IResult> UpdateOccupation(Guid id, UpdateOccupationRequest req, ApplicationDbContext db, CancellationToken ct)
    {
        var patientExists = await db.Patients.AnyAsync(p => p.Id == id, ct);
        if (!patientExists) return Results.NotFound(ApiResponse<object>.Fail($"Patient '{id}' was not found."));

        var row = await db.PatientOccupations.FirstOrDefaultAsync(o => o.PatientId == id, ct);
        var now = DateTime.UtcNow;

        if (row is null)
        {
            row = new PatientOccupation { PatientId = id, ClientId = Guid.NewGuid(), CreatedAt = now };
            await db.PatientOccupations.AddAsync(row, ct);
        }

        row.Occupation = req.Occupation;
        row.Employer = req.Employer;
        row.Industry = req.Industry;
        row.WorkEnvironment = Enum.TryParse<WorkEnvironment>(req.WorkEnvironment, true, out var we) ? we : null;
        row.YearsInOccupation = req.YearsInOccupation;
        row.HazardExposure = req.HazardExposure;
        row.UpdatedAt = now;

        await db.SaveChangesAsync(ct);

        return Results.Ok(ApiResponse<PatientOccupationDto>.Success(new PatientOccupationDto(
            row.Id, row.ClientId, row.Occupation, row.Employer, row.Industry,
            row.WorkEnvironment?.ToString(), row.YearsInOccupation, row.HazardExposure, row.UpdatedAt), "Occupation updated successfully."));
    }

    private static async Task<IResult> GetObstetricProfile(Guid id, ApplicationDbContext db, CancellationToken ct)
    {
        var row = await db.PatientObstetricProfiles.FirstOrDefaultAsync(o => o.PatientId == id, ct);
        if (row is null) return Results.NotFound(ApiResponse<object>.Fail("Obstetric profile not found."));

        return Results.Ok(ApiResponse<PatientObstetricProfileDto>.Success(new PatientObstetricProfileDto(
            row.Id, row.ClientId, row.Gravida, row.Para, row.AbortusCount, row.LivingChildren,
            row.LastMenstrualPeriod, row.Menarche, row.IsPregnant, row.MenstrualCycleLengthDays,
            row.HasDysmenorrhea, row.Notes, row.UpdatedAt)));
    }

    private static async Task<IResult> UpdateObstetricProfile(Guid id, UpdateObstetricProfileRequest req, ApplicationDbContext db, CancellationToken ct)
    {
        var patientExists = await db.Patients.AnyAsync(p => p.Id == id, ct);
        if (!patientExists) return Results.NotFound(ApiResponse<object>.Fail($"Patient '{id}' was not found."));

        var row = await db.PatientObstetricProfiles.FirstOrDefaultAsync(o => o.PatientId == id, ct);
        var now = DateTime.UtcNow;

        if (row is null)
        {
            row = new PatientObstetricProfile { PatientId = id, ClientId = Guid.NewGuid(), CreatedAt = now };
            await db.PatientObstetricProfiles.AddAsync(row, ct);
        }

        row.Gravida = req.Gravida;
        row.Para = req.Para;
        row.AbortusCount = req.AbortusCount;
        row.LivingChildren = req.LivingChildren;
        row.LastMenstrualPeriod = req.LastMenstrualPeriod;
        row.Menarche = req.Menarche;
        row.IsPregnant = req.IsPregnant;
        row.MenstrualCycleLengthDays = req.MenstrualCycleLengthDays;
        row.HasDysmenorrhea = req.HasDysmenorrhea;
        row.Notes = req.Notes;
        row.UpdatedAt = now;

        await db.SaveChangesAsync(ct);

        return Results.Ok(ApiResponse<PatientObstetricProfileDto>.Success(new PatientObstetricProfileDto(
            row.Id, row.ClientId, row.Gravida, row.Para, row.AbortusCount, row.LivingChildren,
            row.LastMenstrualPeriod, row.Menarche, row.IsPregnant, row.MenstrualCycleLengthDays,
            row.HasDysmenorrhea, row.Notes, row.UpdatedAt), "Obstetric profile updated successfully."));
    }

    private static async Task<IResult> GetMaleReproductive(Guid id, ApplicationDbContext db, CancellationToken ct)
    {
        var row = await db.PatientMaleReproductives.FirstOrDefaultAsync(m => m.PatientId == id, ct);
        if (row is null) return Results.NotFound(ApiResponse<object>.Fail("Male reproductive profile not found."));

        return Results.Ok(ApiResponse<PatientMaleReproductiveDto>.Success(new PatientMaleReproductiveDto(
            row.Id, row.ClientId, row.HasVasectomy, row.VasectomyDate, row.Conditions, row.UpdatedAt)));
    }

    private static async Task<IResult> UpdateMaleReproductive(Guid id, UpdateMaleReproductiveRequest req, ApplicationDbContext db, CancellationToken ct)
    {
        var patientExists = await db.Patients.AnyAsync(p => p.Id == id, ct);
        if (!patientExists) return Results.NotFound(ApiResponse<object>.Fail($"Patient '{id}' was not found."));

        var row = await db.PatientMaleReproductives.FirstOrDefaultAsync(m => m.PatientId == id, ct);
        var now = DateTime.UtcNow;

        if (row is null)
        {
            row = new PatientMaleReproductive { PatientId = id, ClientId = Guid.NewGuid(), CreatedAt = now };
            await db.PatientMaleReproductives.AddAsync(row, ct);
        }

        row.HasVasectomy = req.HasVasectomy;
        row.VasectomyDate = req.VasectomyDate;
        row.Conditions = req.Conditions;
        row.UpdatedAt = now;

        await db.SaveChangesAsync(ct);

        return Results.Ok(ApiResponse<PatientMaleReproductiveDto>.Success(new PatientMaleReproductiveDto(
            row.Id, row.ClientId, row.HasVasectomy, row.VasectomyDate, row.Conditions, row.UpdatedAt), "Male reproductive profile updated successfully."));
    }

    private static async Task<IResult> GetDentalVision(Guid id, ApplicationDbContext db, CancellationToken ct)
    {
        var row = await db.PatientDentalVisions.FirstOrDefaultAsync(d => d.PatientId == id, ct);
        if (row is null) return Results.NotFound(ApiResponse<object>.Fail("Dental & vision profile not found."));

        return Results.Ok(ApiResponse<PatientDentalVisionDto>.Success(new PatientDentalVisionDto(
            row.Id, row.ClientId, row.DentistName, row.DentistClinic, row.OrthodonticDevice,
            row.EyeDoctorName, row.CorrectiveLenses?.ToString(), row.UpdatedAt)));
    }

    private static async Task<IResult> UpdateDentalVision(Guid id, UpdateDentalVisionRequest req, ApplicationDbContext db, CancellationToken ct)
    {
        var patientExists = await db.Patients.AnyAsync(p => p.Id == id, ct);
        if (!patientExists) return Results.NotFound(ApiResponse<object>.Fail($"Patient '{id}' was not found."));

        var row = await db.PatientDentalVisions.FirstOrDefaultAsync(d => d.PatientId == id, ct);
        var now = DateTime.UtcNow;

        if (row is null)
        {
            row = new PatientDentalVision { PatientId = id, ClientId = Guid.NewGuid(), CreatedAt = now };
            await db.PatientDentalVisions.AddAsync(row, ct);
        }

        row.DentistName = req.DentistName;
        row.DentistClinic = req.DentistClinic;
        row.OrthodonticDevice = req.OrthodonticDevice;
        row.EyeDoctorName = req.EyeDoctorName;
        row.CorrectiveLenses = Enum.TryParse<CorrectiveLenses>(req.CorrectiveLenses, true, out var cl) ? cl : null;
        row.UpdatedAt = now;

        await db.SaveChangesAsync(ct);

        return Results.Ok(ApiResponse<PatientDentalVisionDto>.Success(new PatientDentalVisionDto(
            row.Id, row.ClientId, row.DentistName, row.DentistClinic, row.OrthodonticDevice,
            row.EyeDoctorName, row.CorrectiveLenses?.ToString(), row.UpdatedAt), "Dental & vision profile updated successfully."));
    }

    private static async Task<IResult> GetMentalHealth(Guid id, ApplicationDbContext db, CancellationToken ct)
    {
        var row = await db.PatientMentalHealthProfiles.FirstOrDefaultAsync(m => m.PatientId == id, ct);
        if (row is null) return Results.NotFound(ApiResponse<object>.Fail("Mental health profile not found."));

        return Results.Ok(ApiResponse<PatientMentalHealthProfileDto>.Success(new PatientMentalHealthProfileDto(
            row.Id, row.ClientId, row.HasDiagnosis, row.DiagnosisName, row.IsOnMedication,
            row.MedicationName, row.TherapistName, row.TherapyType, row.SessionFrequency,
            row.Notes, row.UpdatedAt)));
    }

    private static async Task<IResult> UpdateMentalHealth(Guid id, UpdateMentalHealthRequest req, ApplicationDbContext db, CancellationToken ct)
    {
        var patientExists = await db.Patients.AnyAsync(p => p.Id == id, ct);
        if (!patientExists) return Results.NotFound(ApiResponse<object>.Fail($"Patient '{id}' was not found."));

        var row = await db.PatientMentalHealthProfiles.FirstOrDefaultAsync(m => m.PatientId == id, ct);
        var now = DateTime.UtcNow;

        if (row is null)
        {
            row = new PatientMentalHealthProfile { PatientId = id, ClientId = Guid.NewGuid(), CreatedAt = now };
            await db.PatientMentalHealthProfiles.AddAsync(row, ct);
        }

        row.HasDiagnosis = req.HasDiagnosis;
        row.DiagnosisName = req.DiagnosisName;
        row.IsOnMedication = req.IsOnMedication;
        row.MedicationName = req.MedicationName;
        row.TherapistName = req.TherapistName;
        row.TherapyType = req.TherapyType;
        row.SessionFrequency = req.SessionFrequency;
        row.Notes = req.Notes;
        row.UpdatedAt = now;

        await db.SaveChangesAsync(ct);

        return Results.Ok(ApiResponse<PatientMentalHealthProfileDto>.Success(new PatientMentalHealthProfileDto(
            row.Id, row.ClientId, row.HasDiagnosis, row.DiagnosisName, row.IsOnMedication,
            row.MedicationName, row.TherapistName, row.TherapyType, row.SessionFrequency,
            row.Notes, row.UpdatedAt), "Mental health profile updated successfully."));
    }
}
