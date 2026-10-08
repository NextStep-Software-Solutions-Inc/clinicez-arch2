using System;
using System.Collections.Generic;
using System.Linq;
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

// ── Allergies Requests ────────────────────────────────────────────────────────
public sealed record CreateAllergyRequest(Guid? ClientId, string AllergenName, string AllergyType, string Severity, string? Reaction, DateOnly? OnsetDate, string? Notes);
public sealed record UpdateAllergyRequest(string AllergenName, string AllergyType, string Severity, string? Reaction, DateOnly? OnsetDate, string? Notes);

// ── Medications Requests ──────────────────────────────────────────────────────
public sealed record CreateMedicationRequest(Guid? ClientId, string MedicationName, string? GenericName, string? Dosage, string? Frequency, string? Route, DateOnly? StartDate, DateOnly? EndDate, bool IsCurrentlyTaking, string? PrescribedBy, string? Purpose, string? Notes);
public sealed record UpdateMedicationRequest(string MedicationName, string? GenericName, string? Dosage, string? Frequency, string? Route, DateOnly? StartDate, DateOnly? EndDate, bool IsCurrentlyTaking, string? PrescribedBy, string? Purpose, string? Notes);

public sealed class PatientMedicalHistoryEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/patients/{id:guid}")
            .WithTags("Patients - Medical History");

        // ── Allergies ────────────────────────────────────────────────────────
        group.MapGet("/allergies", GetAllergies).WithName("GetPatientAllergies").RequireAuthorization();
        group.MapPost("/allergies", CreateAllergy).WithName("CreatePatientAllergy").RequireAuthorization();
        group.MapPut("/allergies/{allergyId:guid}", UpdateAllergy).WithName("UpdatePatientAllergy").RequireAuthorization();
        group.MapDelete("/allergies/{allergyId:guid}", DeleteAllergy).WithName("DeletePatientAllergy").RequireAuthorization();

        // ── Medications ──────────────────────────────────────────────────────
        group.MapGet("/medications", GetMedications).WithName("GetPatientMedications").RequireAuthorization();
        group.MapPost("/medications", CreateMedication).WithName("CreatePatientMedication").RequireAuthorization();
        group.MapPut("/medications/{medicationId:guid}", UpdateMedication).WithName("UpdatePatientMedication").RequireAuthorization();
        group.MapDelete("/medications/{medicationId:guid}", DeleteMedication).WithName("DeletePatientMedication").RequireAuthorization();

        // ── Surgical History ─────────────────────────────────────────────────
        group.MapGet("/surgical-histories", async (Guid id, ApplicationDbContext db, CancellationToken ct) =>
        {
            var rows = await db.PatientSurgicalHistories.Where(s => s.PatientId == id && !s.IsDeleted).ToListAsync(ct);
            return Results.Ok(ApiResponse<IReadOnlyList<PatientSurgicalHistoryDto>>.Success(
                rows.Select(s => new PatientSurgicalHistoryDto(s.Id, s.ClientId, s.ProcedureName, s.SurgeonName, s.Hospital, s.SurgeryDate, s.AnesthesiaType, s.Complications, s.Notes, s.UpdatedAt)).ToList().AsReadOnly()));
        }).WithName("GetPatientSurgicalHistories").RequireAuthorization();

        // ── Past Illnesses ───────────────────────────────────────────────────
        group.MapGet("/past-illnesses", async (Guid id, ApplicationDbContext db, CancellationToken ct) =>
        {
            var rows = await db.PatientPastIllnesses.Where(p => p.PatientId == id && !p.IsDeleted).ToListAsync(ct);
            return Results.Ok(ApiResponse<IReadOnlyList<PatientPastIllnessDto>>.Success(
                rows.Select(p => new PatientPastIllnessDto(p.Id, p.ClientId, p.IllnessName, p.DiagnosedAt, p.ResolvedAt, p.TreatmentReceived, p.Notes, p.UpdatedAt)).ToList().AsReadOnly()));
        }).WithName("GetPatientPastIllnesses").RequireAuthorization();

        // ── Chronic Conditions ───────────────────────────────────────────────
        group.MapGet("/chronic-conditions", async (Guid id, ApplicationDbContext db, CancellationToken ct) =>
        {
            var rows = await db.PatientChronicConditions.Where(c => c.PatientId == id && !c.IsDeleted).ToListAsync(ct);
            return Results.Ok(ApiResponse<IReadOnlyList<PatientChronicConditionDto>>.Success(
                rows.Select(c => new PatientChronicConditionDto(c.Id, c.ClientId, c.ConditionName, c.DiagnosedAt, c.IsControlled, c.TreatmentNotes, c.CurrentMedications, c.UpdatedAt)).ToList().AsReadOnly()));
        }).WithName("GetPatientChronicConditions").RequireAuthorization();

        // ── Family Histories ─────────────────────────────────────────────────
        group.MapGet("/family-histories", async (Guid id, ApplicationDbContext db, CancellationToken ct) =>
        {
            var rows = await db.PatientFamilyHistories.Where(f => f.PatientId == id && !f.IsDeleted).ToListAsync(ct);
            return Results.Ok(ApiResponse<IReadOnlyList<PatientFamilyHistoryDto>>.Success(
                rows.Select(f => new PatientFamilyHistoryDto(f.Id, f.ClientId, f.Relation.ToString(), f.ConditionName, f.AgeOfOnset, f.IsDeceased, f.Notes, f.UpdatedAt)).ToList().AsReadOnly()));
        }).WithName("GetPatientFamilyHistories").RequireAuthorization();

        // ── Immunizations Self ───────────────────────────────────────────────
        group.MapGet("/immunizations", async (Guid id, ApplicationDbContext db, CancellationToken ct) =>
        {
            var rows = await db.PatientImmunizationsSelf.Where(i => i.PatientId == id && !i.IsDeleted).ToListAsync(ct);
            return Results.Ok(ApiResponse<IReadOnlyList<PatientImmunizationSelfDto>>.Success(
                rows.Select(i => new PatientImmunizationSelfDto(i.Id, i.ClientId, i.ImmunizationCategory?.ToString(), i.VaccineName, i.DoseNumber, i.LotNumber, i.Date, i.AdministeredBy, i.UpdatedAt)).ToList().AsReadOnly()));
        }).WithName("GetPatientImmunizations").RequireAuthorization();

        // ── Disabilities ─────────────────────────────────────────────────────
        group.MapGet("/disabilities", async (Guid id, ApplicationDbContext db, CancellationToken ct) =>
        {
            var rows = await db.PatientDisabilities.Where(d => d.PatientId == id && !d.IsDeleted).ToListAsync(ct);
            return Results.Ok(ApiResponse<IReadOnlyList<PatientDisabilityDto>>.Success(
                rows.Select(d => new PatientDisabilityDto(d.Id, d.ClientId, d.BodyPart, d.Classification, d.IsPwdCertified, d.UpdatedAt)).ToList().AsReadOnly()));
        }).WithName("GetPatientDisabilities").RequireAuthorization();

        // ── Travel Histories ─────────────────────────────────────────────────
        group.MapGet("/travel-histories", async (Guid id, ApplicationDbContext db, CancellationToken ct) =>
        {
            var rows = await db.PatientTravelHistories.Where(t => t.PatientId == id && !t.IsDeleted).ToListAsync(ct);
            return Results.Ok(ApiResponse<IReadOnlyList<PatientTravelHistoryDto>>.Success(
                rows.Select(t => new PatientTravelHistoryDto(t.Id, t.ClientId, t.Destination, t.CityProvince, t.DepartureDate, t.ReturnDate, t.Purpose?.ToString(), t.IllnessDuringAfterTravel, t.UpdatedAt)).ToList().AsReadOnly()));
        }).WithName("GetPatientTravelHistories").RequireAuthorization();

        // ── Contraceptive Histories ──────────────────────────────────────────
        group.MapGet("/contraceptive-histories", async (Guid id, ApplicationDbContext db, CancellationToken ct) =>
        {
            var rows = await db.PatientContraceptiveHistories.Where(c => c.PatientId == id && !c.IsDeleted).ToListAsync(ct);
            return Results.Ok(ApiResponse<IReadOnlyList<PatientContraceptiveHistoryDto>>.Success(
                rows.Select(c => new PatientContraceptiveHistoryDto(c.Id, c.ClientId, c.Method, c.IsCurrent, c.DateStarted, c.ReasonForStopping, c.UpdatedAt)).ToList().AsReadOnly()));
        }).WithName("GetPatientContraceptiveHistories").RequireAuthorization();

        // ── Pregnancies ──────────────────────────────────────────────────────
        group.MapGet("/pregnancies", async (Guid id, ApplicationDbContext db, CancellationToken ct) =>
        {
            var rows = await db.PatientPregnancies.Where(p => p.PatientId == id && !p.IsDeleted).ToListAsync(ct);
            return Results.Ok(ApiResponse<IReadOnlyList<PatientPregnancyDto>>.Success(
                rows.Select(p => new PatientPregnancyDto(p.Id, p.ClientId, p.Year, p.Outcome, p.GestationalAgeWeeks, p.DeliveryType, p.BirthWeightKg, p.Complications, p.Facility, p.UpdatedAt)).ToList().AsReadOnly()));
        }).WithName("GetPatientPregnancies").RequireAuthorization();

        // ── Healthcare Providers ─────────────────────────────────────────────
        group.MapGet("/healthcare-providers", async (Guid id, ApplicationDbContext db, CancellationToken ct) =>
        {
            var rows = await db.PatientHealthcareProviders.Where(h => h.PatientId == id && !h.IsDeleted).ToListAsync(ct);
            return Results.Ok(ApiResponse<IReadOnlyList<PatientHealthcareProviderDto>>.Success(
                rows.Select(h => new PatientHealthcareProviderDto(h.Id, h.ClientId, h.ProviderType.ToString(), h.Name, h.Specialty, h.ClinicHospital, h.Phone, h.UpdatedAt)).ToList().AsReadOnly()));
        }).WithName("GetPatientHealthcareProviders").RequireAuthorization();
    }

    // ── Allergies Handlers ───────────────────────────────────────────────────

    private static async Task<IResult> GetAllergies(Guid id, ApplicationDbContext db, CancellationToken ct)
    {
        var rows = await db.PatientAllergies.Where(a => a.PatientId == id && !a.IsDeleted).ToListAsync(ct);
        var dtos = rows.Select(a => new PatientAllergyDto(
            a.Id, a.ClientId, a.AllergenName, a.AllergyType.ToString(), a.Severity.ToString(),
            a.Reaction, a.OnsetDate, a.Notes, a.UpdatedAt)).ToList().AsReadOnly();
        return Results.Ok(ApiResponse<IReadOnlyList<PatientAllergyDto>>.Success(dtos));
    }

    private static async Task<IResult> CreateAllergy(Guid id, CreateAllergyRequest req, ApplicationDbContext db, CancellationToken ct)
    {
        var patientExists = await db.Patients.AnyAsync(p => p.Id == id, ct);
        if (!patientExists) return Results.NotFound(ApiResponse<object>.Fail($"Patient '{id}' was not found."));

        var now = DateTime.UtcNow;
        var entity = new PatientAllergy
        {
            PatientId = id,
            ClientId = req.ClientId ?? Guid.NewGuid(),
            AllergenName = req.AllergenName.Trim(),
            AllergyType = Enum.TryParse<AllergyType>(req.AllergyType, true, out var at) ? at : AllergyType.Other,
            Severity = Enum.TryParse<AllergySeverity>(req.Severity, true, out var sv) ? sv : AllergySeverity.Mild,
            Reaction = req.Reaction?.Trim(),
            OnsetDate = req.OnsetDate,
            Notes = req.Notes?.Trim(),
            CreatedAt = now,
            UpdatedAt = now,
        };

        await db.PatientAllergies.AddAsync(entity, ct);
        await db.SaveChangesAsync(ct);

        var dto = new PatientAllergyDto(
            entity.Id, entity.ClientId, entity.AllergenName, entity.AllergyType.ToString(),
            entity.Severity.ToString(), entity.Reaction, entity.OnsetDate, entity.Notes, entity.UpdatedAt);

        return Results.Created($"/api/v1/patients/{id}/allergies/{entity.Id}", ApiResponse<PatientAllergyDto>.Success(dto, "Allergy created successfully."));
    }

    private static async Task<IResult> UpdateAllergy(Guid id, Guid allergyId, UpdateAllergyRequest req, ApplicationDbContext db, CancellationToken ct)
    {
        var entity = await db.PatientAllergies.FirstOrDefaultAsync(a => a.Id == allergyId && a.PatientId == id && !a.IsDeleted, ct);
        if (entity is null) return Results.NotFound(ApiResponse<object>.Fail($"Allergy '{allergyId}' was not found."));

        entity.AllergenName = req.AllergenName.Trim();
        entity.AllergyType = Enum.TryParse<AllergyType>(req.AllergyType, true, out var at) ? at : entity.AllergyType;
        entity.Severity = Enum.TryParse<AllergySeverity>(req.Severity, true, out var sv) ? sv : entity.Severity;
        entity.Reaction = req.Reaction?.Trim();
        entity.OnsetDate = req.OnsetDate;
        entity.Notes = req.Notes?.Trim();
        entity.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);

        var dto = new PatientAllergyDto(
            entity.Id, entity.ClientId, entity.AllergenName, entity.AllergyType.ToString(),
            entity.Severity.ToString(), entity.Reaction, entity.OnsetDate, entity.Notes, entity.UpdatedAt);

        return Results.Ok(ApiResponse<PatientAllergyDto>.Success(dto, "Allergy updated successfully."));
    }

    private static async Task<IResult> DeleteAllergy(Guid id, Guid allergyId, ApplicationDbContext db, CancellationToken ct)
    {
        var entity = await db.PatientAllergies.FirstOrDefaultAsync(a => a.Id == allergyId && a.PatientId == id, ct);
        if (entity is null) return Results.NotFound(ApiResponse<object>.Fail($"Allergy '{allergyId}' was not found."));

        db.PatientAllergies.Remove(entity);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    // ── Medications Handlers ─────────────────────────────────────────────────

    private static async Task<IResult> GetMedications(Guid id, ApplicationDbContext db, CancellationToken ct)
    {
        var rows = await db.PatientMedications.Where(m => m.PatientId == id && !m.IsDeleted).ToListAsync(ct);
        var dtos = rows.Select(m => new PatientMedicationDto(
            m.Id, m.ClientId, m.MedicationName, m.GenericName, m.Dosage, m.Frequency, m.Route,
            m.StartDate, m.EndDate, m.IsCurrentlyTaking, m.PrescribedBy, m.Purpose, m.Notes, m.UpdatedAt)).ToList().AsReadOnly();
        return Results.Ok(ApiResponse<IReadOnlyList<PatientMedicationDto>>.Success(dtos));
    }

    private static async Task<IResult> CreateMedication(Guid id, CreateMedicationRequest req, ApplicationDbContext db, CancellationToken ct)
    {
        var patientExists = await db.Patients.AnyAsync(p => p.Id == id, ct);
        if (!patientExists) return Results.NotFound(ApiResponse<object>.Fail($"Patient '{id}' was not found."));

        var now = DateTime.UtcNow;
        var entity = new PatientMedication
        {
            PatientId = id,
            ClientId = req.ClientId ?? Guid.NewGuid(),
            MedicationName = req.MedicationName.Trim(),
            GenericName = req.GenericName?.Trim(),
            Dosage = req.Dosage?.Trim(),
            Frequency = req.Frequency?.Trim(),
            Route = req.Route?.Trim(),
            StartDate = req.StartDate,
            EndDate = req.EndDate,
            IsCurrentlyTaking = req.IsCurrentlyTaking,
            PrescribedBy = req.PrescribedBy?.Trim(),
            Purpose = req.Purpose?.Trim(),
            Notes = req.Notes?.Trim(),
            CreatedAt = now,
            UpdatedAt = now,
        };

        await db.PatientMedications.AddAsync(entity, ct);
        await db.SaveChangesAsync(ct);

        var dto = new PatientMedicationDto(
            entity.Id, entity.ClientId, entity.MedicationName, entity.GenericName, entity.Dosage,
            entity.Frequency, entity.Route, entity.StartDate, entity.EndDate, entity.IsCurrentlyTaking,
            entity.PrescribedBy, entity.Purpose, entity.Notes, entity.UpdatedAt);

        return Results.Created($"/api/v1/patients/{id}/medications/{entity.Id}", ApiResponse<PatientMedicationDto>.Success(dto, "Medication created successfully."));
    }

    private static async Task<IResult> UpdateMedication(Guid id, Guid medicationId, UpdateMedicationRequest req, ApplicationDbContext db, CancellationToken ct)
    {
        var entity = await db.PatientMedications.FirstOrDefaultAsync(m => m.Id == medicationId && m.PatientId == id && !m.IsDeleted, ct);
        if (entity is null) return Results.NotFound(ApiResponse<object>.Fail($"Medication '{medicationId}' was not found."));

        entity.MedicationName = req.MedicationName.Trim();
        entity.GenericName = req.GenericName?.Trim();
        entity.Dosage = req.Dosage?.Trim();
        entity.Frequency = req.Frequency?.Trim();
        entity.Route = req.Route?.Trim();
        entity.StartDate = req.StartDate;
        entity.EndDate = req.EndDate;
        entity.IsCurrentlyTaking = req.IsCurrentlyTaking;
        entity.PrescribedBy = req.PrescribedBy?.Trim();
        entity.Purpose = req.Purpose?.Trim();
        entity.Notes = req.Notes?.Trim();
        entity.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);

        var dto = new PatientMedicationDto(
            entity.Id, entity.ClientId, entity.MedicationName, entity.GenericName, entity.Dosage,
            entity.Frequency, entity.Route, entity.StartDate, entity.EndDate, entity.IsCurrentlyTaking,
            entity.PrescribedBy, entity.Purpose, entity.Notes, entity.UpdatedAt);

        return Results.Ok(ApiResponse<PatientMedicationDto>.Success(dto, "Medication updated successfully."));
    }

    private static async Task<IResult> DeleteMedication(Guid id, Guid medicationId, ApplicationDbContext db, CancellationToken ct)
    {
        var entity = await db.PatientMedications.FirstOrDefaultAsync(m => m.Id == medicationId && m.PatientId == id, ct);
        if (entity is null) return Results.NotFound(ApiResponse<object>.Fail($"Medication '{medicationId}' was not found."));

        db.PatientMedications.Remove(entity);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}
