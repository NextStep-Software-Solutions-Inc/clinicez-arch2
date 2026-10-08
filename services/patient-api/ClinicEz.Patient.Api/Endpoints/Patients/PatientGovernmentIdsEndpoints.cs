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

public sealed record UpdateGovernmentIdItemRequest(
    Guid? Id,
    Guid? ClientId,
    string IdType,
    string IdNumber,
    DateOnly? IssuedAt = null,
    DateOnly? ExpiresAt = null,
    string? PhilhealthCategory = null,
    string? SponsorPin = null,
    string? SponsorLastName = null,
    string? SponsorFirstName = null,
    string? SponsorMiddleName = null,
    string? SponsorSuffix = null,
    DateOnly? SponsorDob = null,
    string? SponsorRelationship = null);

public sealed record UpdatePatientGovernmentIdsRequest(IReadOnlyList<UpdateGovernmentIdItemRequest> Items);

public sealed class PatientGovernmentIdsEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/patients/{id:guid}/government-ids")
            .WithTags("Patients - Government IDs");

        group.MapGet("/", GetGovernmentIds)
            .WithName("GetPatientGovernmentIds")
            .WithSummary("Retrieve all government IDs for a patient")
            .Produces<ApiResponse<IReadOnlyList<PatientGovernmentIdDto>>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();

        group.MapPut("/", UpdateGovernmentIds)
            .WithName("UpdatePatientGovernmentIds")
            .WithSummary("Update or bulk replace government IDs for a patient")
            .Produces<ApiResponse<IReadOnlyList<PatientGovernmentIdDto>>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }

    private static async Task<IResult> GetGovernmentIds(
        Guid id,
        ApplicationDbContext db,
        CancellationToken ct)
    {
        var patientExists = await db.Patients.AnyAsync(p => p.Id == id, ct);
        if (!patientExists)
            return Results.NotFound(ApiResponse<object>.Fail($"Patient '{id}' was not found."));

        var ids = await db.PatientGovernmentIds
            .Where(g => g.PatientId == id && !g.IsDeleted)
            .OrderBy(g => g.IdType)
            .Select(g => new PatientGovernmentIdDto(
                g.Id,
                g.ClientId,
                g.IdType.ToString(),
                g.IdNumber,
                g.IssuedAt,
                g.ExpiresAt,
                g.UpdatedAt))
            .ToListAsync(ct);

        return Results.Ok(ApiResponse<IReadOnlyList<PatientGovernmentIdDto>>.Success(ids.AsReadOnly()));
    }

    private static async Task<IResult> UpdateGovernmentIds(
        Guid id,
        UpdatePatientGovernmentIdsRequest request,
        ApplicationDbContext db,
        CancellationToken ct)
    {
        var patient = await db.Patients
            .Include(p => p.GovernmentIds)
            .FirstOrDefaultAsync(p => p.Id == id, ct);

        if (patient is null)
            return Results.NotFound(ApiResponse<object>.Fail($"Patient '{id}' was not found."));

        var now = DateTime.UtcNow;
        var existingList = patient.GovernmentIds.Where(g => !g.IsDeleted).ToList();

        foreach (var item in request.Items)
        {
            if (string.IsNullOrWhiteSpace(item.IdNumber)) continue;

            if (!Enum.TryParse<GovernmentIdType>(item.IdType, true, out var parsedType))
                continue;

            // Find existing by Id, ClientId, or IdType
            var existing = existingList.FirstOrDefault(g =>
                (item.Id.HasValue && g.Id == item.Id.Value) ||
                (item.ClientId.HasValue && item.ClientId.Value != Guid.Empty && g.ClientId == item.ClientId.Value) ||
                g.IdType == parsedType);

            if (existing is not null)
            {
                existing.IdNumber = item.IdNumber.Trim();
                existing.IssuedAt = item.IssuedAt;
                existing.ExpiresAt = item.ExpiresAt;
                existing.UpdatedAt = now;
                if (parsedType == GovernmentIdType.PhilHealth)
                {
                    existing.PhilhealthCategory = item.PhilhealthCategory;
                    existing.SponsorPin = item.SponsorPin;
                    existing.SponsorLastName = item.SponsorLastName;
                    existing.SponsorFirstName = item.SponsorFirstName;
                    existing.SponsorMiddleName = item.SponsorMiddleName;
                    existing.SponsorSuffix = item.SponsorSuffix;
                    existing.SponsorDob = item.SponsorDob;
                    existing.SponsorRelationship = item.SponsorRelationship;
                }
            }
            else
            {
                var newEntity = new PatientGovernmentId
                {
                    PatientId = id,
                    ClientId = item.ClientId ?? Guid.NewGuid(),
                    IdType = parsedType,
                    IdNumber = item.IdNumber.Trim(),
                    IssuedAt = item.IssuedAt,
                    ExpiresAt = item.ExpiresAt,
                    PhilhealthCategory = parsedType == GovernmentIdType.PhilHealth ? item.PhilhealthCategory : null,
                    SponsorPin = parsedType == GovernmentIdType.PhilHealth ? item.SponsorPin : null,
                    SponsorLastName = parsedType == GovernmentIdType.PhilHealth ? item.SponsorLastName : null,
                    SponsorFirstName = parsedType == GovernmentIdType.PhilHealth ? item.SponsorFirstName : null,
                    SponsorMiddleName = parsedType == GovernmentIdType.PhilHealth ? item.SponsorMiddleName : null,
                    SponsorSuffix = parsedType == GovernmentIdType.PhilHealth ? item.SponsorSuffix : null,
                    SponsorDob = parsedType == GovernmentIdType.PhilHealth ? item.SponsorDob : null,
                    SponsorRelationship = parsedType == GovernmentIdType.PhilHealth ? item.SponsorRelationship : null,
                    CreatedAt = now,
                    UpdatedAt = now,
                };
                await db.PatientGovernmentIds.AddAsync(newEntity, ct);
            }
        }

        await db.SaveChangesAsync(ct);

        var updated = await db.PatientGovernmentIds
            .Where(g => g.PatientId == id && !g.IsDeleted)
            .OrderBy(g => g.IdType)
            .Select(g => new PatientGovernmentIdDto(
                g.Id,
                g.ClientId,
                g.IdType.ToString(),
                g.IdNumber,
                g.IssuedAt,
                g.ExpiresAt,
                g.UpdatedAt))
            .ToListAsync(ct);

        return Results.Ok(ApiResponse<IReadOnlyList<PatientGovernmentIdDto>>.Success(
            updated.AsReadOnly(),
            "Government IDs updated successfully."));
    }
}
