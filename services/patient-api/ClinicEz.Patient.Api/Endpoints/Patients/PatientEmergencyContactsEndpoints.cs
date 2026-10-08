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
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Common;

namespace ClinicEz.Patient.Api.Endpoints.Patients;

public sealed record CreateEmergencyContactRequest(
    Guid? ClientId,
    string FullName,
    string? Relationship,
    string Mobile,
    string? AltPhone,
    bool IsPrimary = false);

public sealed record UpdateEmergencyContactRequest(
    string FullName,
    string? Relationship,
    string Mobile,
    string? AltPhone,
    bool IsPrimary = false);

public sealed class PatientEmergencyContactsEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/patients/{id:guid}/emergency-contacts")
            .WithTags("Patients - Emergency Contacts");

        group.MapGet("/", GetEmergencyContacts)
            .WithName("GetPatientEmergencyContacts")
            .WithSummary("Retrieve all emergency contacts for a patient")
            .Produces<ApiResponse<IReadOnlyList<EmergencyContactDto>>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();

        group.MapPost("/", CreateEmergencyContact)
            .WithName("CreatePatientEmergencyContact")
            .WithSummary("Add an emergency contact for a patient")
            .Produces<ApiResponse<EmergencyContactDto>>(StatusCodes.Status201Created)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .ProducesValidationProblem()
            .RequireAuthorization();

        group.MapPut("/{contactId:guid}", UpdateEmergencyContact)
            .WithName("UpdatePatientEmergencyContact")
            .WithSummary("Update an emergency contact for a patient")
            .Produces<ApiResponse<EmergencyContactDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .ProducesValidationProblem()
            .RequireAuthorization();

        group.MapDelete("/{contactId:guid}", DeleteEmergencyContact)
            .WithName("DeletePatientEmergencyContact")
            .WithSummary("Delete an emergency contact for a patient")
            .Produces(StatusCodes.Status204NoContent)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }

    private static async Task<IResult> GetEmergencyContacts(Guid id, ApplicationDbContext db, CancellationToken ct)
    {
        var patientExists = await db.Patients.AnyAsync(p => p.Id == id, ct);
        if (!patientExists)
            return Results.NotFound(ApiResponse<object>.Fail($"Patient '{id}' was not found."));

        var contacts = await db.EmergencyContacts
            .Where(e => e.PatientId == id && !e.IsDeleted)
            .OrderByDescending(e => e.IsPrimary)
            .ThenByDescending(e => e.UpdatedAt ?? e.CreatedAt)
            .Select(e => new EmergencyContactDto(
                e.Id,
                e.ClientId,
                e.FullName,
                e.Relationship,
                e.Mobile,
                e.AltPhone,
                e.IsPrimary,
                e.UpdatedAt))
            .ToListAsync(ct);

        return Results.Ok(ApiResponse<IReadOnlyList<EmergencyContactDto>>.Success(contacts.AsReadOnly()));
    }

    private static async Task<IResult> CreateEmergencyContact(
        Guid id,
        CreateEmergencyContactRequest request,
        ApplicationDbContext db,
        CancellationToken ct)
    {
        var patientExists = await db.Patients.AnyAsync(p => p.Id == id, ct);
        if (!patientExists)
            return Results.NotFound(ApiResponse<object>.Fail($"Patient '{id}' was not found."));

        var now = DateTime.UtcNow;

        if (request.IsPrimary)
        {
            var existingPrimaries = await db.EmergencyContacts
                .Where(e => e.PatientId == id && e.IsPrimary && !e.IsDeleted)
                .ToListAsync(ct);
            foreach (var p in existingPrimaries)
            {
                p.IsPrimary = false;
                p.UpdatedAt = now;
            }
        }

        var entity = new EmergencyContact
        {
            PatientId = id,
            ClientId = request.ClientId ?? Guid.NewGuid(),
            FullName = request.FullName.Trim(),
            Relationship = request.Relationship?.Trim(),
            Mobile = request.Mobile.Trim(),
            AltPhone = request.AltPhone?.Trim(),
            IsPrimary = request.IsPrimary,
            CreatedAt = now,
            UpdatedAt = now,
        };

        await db.EmergencyContacts.AddAsync(entity, ct);
        await db.SaveChangesAsync(ct);

        var dto = new EmergencyContactDto(
            entity.Id,
            entity.ClientId,
            entity.FullName,
            entity.Relationship,
            entity.Mobile,
            entity.AltPhone,
            entity.IsPrimary,
            entity.UpdatedAt);

        return Results.Created(
            $"/api/v1/patients/{id}/emergency-contacts/{entity.Id}",
            ApiResponse<EmergencyContactDto>.Success(dto, "Emergency contact created successfully."));
    }

    private static async Task<IResult> UpdateEmergencyContact(
        Guid id,
        Guid contactId,
        UpdateEmergencyContactRequest request,
        ApplicationDbContext db,
        CancellationToken ct)
    {
        var entity = await db.EmergencyContacts
            .FirstOrDefaultAsync(e => e.Id == contactId && e.PatientId == id && !e.IsDeleted, ct);

        if (entity is null)
            return Results.NotFound(ApiResponse<object>.Fail($"Emergency contact '{contactId}' was not found."));

        var now = DateTime.UtcNow;

        if (request.IsPrimary && !entity.IsPrimary)
        {
            var existingPrimaries = await db.EmergencyContacts
                .Where(e => e.PatientId == id && e.Id != contactId && e.IsPrimary && !e.IsDeleted)
                .ToListAsync(ct);
            foreach (var p in existingPrimaries)
            {
                p.IsPrimary = false;
                p.UpdatedAt = now;
            }
        }

        entity.FullName = request.FullName.Trim();
        entity.Relationship = request.Relationship?.Trim();
        entity.Mobile = request.Mobile.Trim();
        entity.AltPhone = request.AltPhone?.Trim();
        entity.IsPrimary = request.IsPrimary;
        entity.UpdatedAt = now;

        await db.SaveChangesAsync(ct);

        var dto = new EmergencyContactDto(
            entity.Id,
            entity.ClientId,
            entity.FullName,
            entity.Relationship,
            entity.Mobile,
            entity.AltPhone,
            entity.IsPrimary,
            entity.UpdatedAt);

        return Results.Ok(ApiResponse<EmergencyContactDto>.Success(dto, "Emergency contact updated successfully."));
    }

    private static async Task<IResult> DeleteEmergencyContact(
        Guid id,
        Guid contactId,
        ApplicationDbContext db,
        CancellationToken ct)
    {
        var entity = await db.EmergencyContacts
            .FirstOrDefaultAsync(e => e.Id == contactId && e.PatientId == id, ct);

        if (entity is null)
            return Results.NotFound(ApiResponse<object>.Fail($"Emergency contact '{contactId}' was not found."));

        db.EmergencyContacts.Remove(entity);
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}
