using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
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
    bool IsPrimary,
    string? StreetAddress = null,
    string? RegionPsgc = null,
    string? ProvincePsgc = null,
    string? CityMunicipalityPsgc = null,
    string? BarangayPsgc = null,
    string? RegionName = null,
    string? ProvinceName = null,
    string? CityMunicipalityName = null,
    string? BarangayName = null,
    bool IsSameAsPermanent = false);

public sealed record UpdatePatientAddressRequest(
    string? Type,
    string? HouseStreet,
    string? Barangay,
    string CityMunicipality,
    string? Province,
    string? Region,
    string? ZipCode,
    string? Country,
    bool IsPrimary,
    string? StreetAddress = null,
    string? RegionPsgc = null,
    string? ProvincePsgc = null,
    string? CityMunicipalityPsgc = null,
    string? BarangayPsgc = null,
    string? RegionName = null,
    string? ProvinceName = null,
    string? CityMunicipalityName = null,
    string? BarangayName = null,
    bool IsSameAsPermanent = false);

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
                a.UpdatedAt,
                a.StreetAddress,
                a.RegionPsgc,
                a.ProvincePsgc,
                a.CityMunicipalityPsgc,
                a.BarangayPsgc,
                a.RegionName,
                a.ProvinceName,
                a.CityMunicipalityName,
                a.BarangayName,
                a.IsSameAsPermanent))
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
            IsSameAsPermanent = request.IsSameAsPermanent,
            HouseStreet = request.HouseStreet?.Trim(),
            StreetAddress = request.StreetAddress?.Trim() ?? request.HouseStreet?.Trim(),
            Barangay = request.Barangay?.Trim() ?? request.BarangayName?.Trim(),
            CityMunicipality = !string.IsNullOrWhiteSpace(request.CityMunicipality) ? request.CityMunicipality.Trim() : (request.CityMunicipalityName?.Trim() ?? string.Empty),
            Province = request.Province?.Trim() ?? request.ProvinceName?.Trim(),
            Region = request.Region?.Trim() ?? request.RegionName?.Trim(),
            ZipCode = request.ZipCode?.Trim(),
            Country = request.Country?.Trim() ?? "Philippines",
            RegionPsgc = request.RegionPsgc?.Trim(),
            ProvincePsgc = request.ProvincePsgc?.Trim(),
            CityMunicipalityPsgc = request.CityMunicipalityPsgc?.Trim(),
            BarangayPsgc = request.BarangayPsgc?.Trim(),
            RegionName = request.RegionName?.Trim() ?? request.Region?.Trim(),
            ProvinceName = request.ProvinceName?.Trim() ?? request.Province?.Trim(),
            CityMunicipalityName = request.CityMunicipalityName?.Trim() ?? request.CityMunicipality.Trim(),
            BarangayName = request.BarangayName?.Trim() ?? request.Barangay?.Trim(),
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
            entity.UpdatedAt,
            entity.StreetAddress,
            entity.RegionPsgc,
            entity.ProvincePsgc,
            entity.CityMunicipalityPsgc,
            entity.BarangayPsgc,
            entity.RegionName,
            entity.ProvinceName,
            entity.CityMunicipalityName,
            entity.BarangayName,
            entity.IsSameAsPermanent);

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
        entity.IsSameAsPermanent = request.IsSameAsPermanent;
        entity.HouseStreet = request.HouseStreet?.Trim();
        entity.StreetAddress = request.StreetAddress?.Trim() ?? request.HouseStreet?.Trim();
        entity.Barangay = request.Barangay?.Trim() ?? request.BarangayName?.Trim();
        entity.CityMunicipality = !string.IsNullOrWhiteSpace(request.CityMunicipality) ? request.CityMunicipality.Trim() : (request.CityMunicipalityName?.Trim() ?? entity.CityMunicipality);
        entity.Province = request.Province?.Trim() ?? request.ProvinceName?.Trim();
        entity.Region = request.Region?.Trim() ?? request.RegionName?.Trim();
        entity.ZipCode = request.ZipCode?.Trim();
        entity.Country = request.Country?.Trim() ?? entity.Country;
        entity.RegionPsgc = request.RegionPsgc?.Trim() ?? entity.RegionPsgc;
        entity.ProvincePsgc = request.ProvincePsgc?.Trim() ?? entity.ProvincePsgc;
        entity.CityMunicipalityPsgc = request.CityMunicipalityPsgc?.Trim() ?? entity.CityMunicipalityPsgc;
        entity.BarangayPsgc = request.BarangayPsgc?.Trim() ?? entity.BarangayPsgc;
        entity.RegionName = request.RegionName?.Trim() ?? request.Region?.Trim() ?? entity.RegionName;
        entity.ProvinceName = request.ProvinceName?.Trim() ?? request.Province?.Trim() ?? entity.ProvinceName;
        entity.CityMunicipalityName = request.CityMunicipalityName?.Trim() ?? request.CityMunicipality.Trim() ?? entity.CityMunicipalityName;
        entity.BarangayName = request.BarangayName?.Trim() ?? request.Barangay?.Trim() ?? entity.BarangayName;
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
            entity.UpdatedAt,
            entity.StreetAddress,
            entity.RegionPsgc,
            entity.ProvincePsgc,
            entity.CityMunicipalityPsgc,
            entity.BarangayPsgc,
            entity.RegionName,
            entity.ProvinceName,
            entity.CityMunicipalityName,
            entity.BarangayName,
            entity.IsSameAsPermanent);

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
