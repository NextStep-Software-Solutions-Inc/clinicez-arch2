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

public sealed record CreatePatientAddressRequest(
    Guid? ClientId,
    string? Type,
    string? HouseStreet,
    string? Barangay,
    string CityMunicipality,
    string? Province,
    string? Region,
    string? ZipCode,
    string? Country,
    bool IsPrimary);

public sealed record UpdatePatientAddressRequest(
    string? Type,
    string? HouseStreet,
    string? Barangay,
    string CityMunicipality,
    string? Province,
    string? Region,
    string? ZipCode,
    string? Country,
    bool IsPrimary);

public sealed class PatientAddressesEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/patients/{id:guid}/addresses")
            .WithTags("Patients - Addresses");

        group.MapGet("/", GetAddresses)
            .WithName("GetPatientAddresses")
            .WithSummary("Retrieve all addresses for a patient")
            .Produces<ApiResponse<IReadOnlyList<PatientAddressDto>>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();

        group.MapPost("/", CreateAddress)
            .WithName("CreatePatientAddress")
            .WithSummary("Add a new address for a patient")
            .Produces<ApiResponse<PatientAddressDto>>(StatusCodes.Status201Created)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .ProducesValidationProblem()
            .RequireAuthorization();

        group.MapPut("/{addressId:guid}", UpdateAddress)
            .WithName("UpdatePatientAddress")
            .WithSummary("Update an existing address for a patient")
            .Produces<ApiResponse<PatientAddressDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .ProducesValidationProblem()
            .RequireAuthorization();

        group.MapDelete("/{addressId:guid}", DeleteAddress)
            .WithName("DeletePatientAddress")
            .WithSummary("Delete an address for a patient")
            .Produces(StatusCodes.Status204NoContent)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }

    private static async Task<IResult> GetAddresses(Guid id, ApplicationDbContext db, CancellationToken ct)
    {
        var patientExists = await db.Patients.AnyAsync(p => p.Id == id, ct);
        if (!patientExists)
            return Results.NotFound(ApiResponse<object>.Fail($"Patient '{id}' was not found."));

        var addresses = await db.PatientAddresses
            .Where(a => a.PatientId == id && !a.IsDeleted)
            .OrderByDescending(a => a.IsPrimary)
            .ThenByDescending(a => a.UpdatedAt ?? a.CreatedAt)
            .Select(a => new PatientAddressDto(
                a.Id,
                a.ClientId,
                a.Type.ToString(),
                a.HouseStreet,
                a.Barangay,
                a.CityMunicipality,
                a.Province,
                a.Region,
                a.ZipCode,
                a.Country,
                a.IsPrimary,
                a.UpdatedAt))
            .ToListAsync(ct);

        return Results.Ok(ApiResponse<IReadOnlyList<PatientAddressDto>>.Success(addresses.AsReadOnly()));
    }

    private static async Task<IResult> CreateAddress(
        Guid id,
        CreatePatientAddressRequest request,
        ApplicationDbContext db,
        CancellationToken ct)
    {
        var patientExists = await db.Patients.AnyAsync(p => p.Id == id, ct);
        if (!patientExists)
            return Results.NotFound(ApiResponse<object>.Fail($"Patient '{id}' was not found."));

        var now = DateTime.UtcNow;
        var isPrimary = string.Equals(request.Type, "primary", StringComparison.OrdinalIgnoreCase) || request.IsPrimary;

        if (isPrimary)
        {
            var existingPrimaries = await db.PatientAddresses
                .Where(a => a.PatientId == id && a.IsPrimary && !a.IsDeleted)
                .ToListAsync(ct);
            foreach (var p in existingPrimaries)
            {
                p.IsPrimary = false;
                p.UpdatedAt = now;
            }
        }

        var entity = new PatientAddress
        {
            PatientId = id,
            ClientId = request.ClientId ?? Guid.NewGuid(),
            Type = AddressType.Home,
            IsPrimary = isPrimary,
            HouseStreet = request.HouseStreet?.Trim(),
            Barangay = request.Barangay?.Trim(),
            CityMunicipality = request.CityMunicipality.Trim(),
            Province = request.Province?.Trim(),
            Region = request.Region?.Trim(),
            ZipCode = request.ZipCode?.Trim(),
            Country = request.Country?.Trim() ?? "Philippines",
            CreatedAt = now,
            UpdatedAt = now,
        };

        await db.PatientAddresses.AddAsync(entity, ct);
        await db.SaveChangesAsync(ct);

        var dto = new PatientAddressDto(
            entity.Id,
            entity.ClientId,
            entity.Type.ToString(),
            entity.HouseStreet,
            entity.Barangay,
            entity.CityMunicipality,
            entity.Province,
            entity.Region,
            entity.ZipCode,
            entity.Country,
            entity.IsPrimary,
            entity.UpdatedAt);

        return Results.Created(
            $"/api/v1/patients/{id}/addresses/{entity.Id}",
            ApiResponse<PatientAddressDto>.Success(dto, "Address created successfully."));
    }

    private static async Task<IResult> UpdateAddress(
        Guid id,
        Guid addressId,
        UpdatePatientAddressRequest request,
        ApplicationDbContext db,
        CancellationToken ct)
    {
        var entity = await db.PatientAddresses
            .FirstOrDefaultAsync(a => a.Id == addressId && a.PatientId == id && !a.IsDeleted, ct);

        if (entity is null)
            return Results.NotFound(ApiResponse<object>.Fail($"Address '{addressId}' was not found."));

        var now = DateTime.UtcNow;
        var isPrimary = string.Equals(request.Type, "primary", StringComparison.OrdinalIgnoreCase) || request.IsPrimary;

        if (isPrimary && !entity.IsPrimary)
        {
            var existingPrimaries = await db.PatientAddresses
                .Where(a => a.PatientId == id && a.Id != addressId && a.IsPrimary && !a.IsDeleted)
                .ToListAsync(ct);
            foreach (var p in existingPrimaries)
            {
                p.IsPrimary = false;
                p.UpdatedAt = now;
            }
        }

        entity.IsPrimary = isPrimary;
        entity.HouseStreet = request.HouseStreet?.Trim();
        entity.Barangay = request.Barangay?.Trim();
        entity.CityMunicipality = request.CityMunicipality.Trim();
        entity.Province = request.Province?.Trim();
        entity.Region = request.Region?.Trim();
        entity.ZipCode = request.ZipCode?.Trim();
        entity.Country = request.Country?.Trim() ?? "Philippines";
        entity.UpdatedAt = now;

        await db.SaveChangesAsync(ct);

        var dto = new PatientAddressDto(
            entity.Id,
            entity.ClientId,
            entity.Type.ToString(),
            entity.HouseStreet,
            entity.Barangay,
            entity.CityMunicipality,
            entity.Province,
            entity.Region,
            entity.ZipCode,
            entity.Country,
            entity.IsPrimary,
            entity.UpdatedAt);

        return Results.Ok(ApiResponse<PatientAddressDto>.Success(dto, "Address updated successfully."));
    }

    private static async Task<IResult> DeleteAddress(
        Guid id,
        Guid addressId,
        ApplicationDbContext db,
        CancellationToken ct)
    {
        var entity = await db.PatientAddresses
            .FirstOrDefaultAsync(a => a.Id == addressId && a.PatientId == id, ct);

        if (entity is null)
            return Results.NotFound(ApiResponse<object>.Fail($"Address '{addressId}' was not found."));

        db.PatientAddresses.Remove(entity);
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}
