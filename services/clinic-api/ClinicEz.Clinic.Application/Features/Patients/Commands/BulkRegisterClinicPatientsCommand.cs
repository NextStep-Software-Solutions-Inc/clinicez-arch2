using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

public sealed record BulkPatientItemDto(
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
    Dictionary<string, object?>? CustomFields = null,
    string VerificationStatus = "PendingVerification"
);

public sealed record BulkRegisterPatientsResultDto(
    int TotalProcessed,
    int SuccessCount,
    IReadOnlyList<ClinicPatientDto> CreatedPatients
);

public sealed record BulkRegisterClinicPatientsCommand(
    IReadOnlyList<BulkPatientItemDto> Patients
) : IRequest<BulkRegisterPatientsResultDto>;

public sealed class BulkRegisterClinicPatientsCommandHandler
    : IRequestHandler<BulkRegisterClinicPatientsCommand, BulkRegisterPatientsResultDto>
{
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IPatientCodeGenerator _codeGenerator;

    public BulkRegisterClinicPatientsCommandHandler(
        IRepository<ClinicPatient> patientRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IPatientCodeGenerator? codeGenerator = null)
    {
        _patientRepo = patientRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _codeGenerator = codeGenerator ?? ResolveFallbackCodeGenerator(patientRepo, unitOfWork);
    }

    private static IPatientCodeGenerator ResolveFallbackCodeGenerator(
        IRepository<ClinicPatient> patientRepo,
        IUnitOfWork unitOfWork)
    {
        var dbContext = (patientRepo.GetType().GetProperty("DbContext")?.GetValue(patientRepo)
            ?? unitOfWork.GetType().GetProperty("DbContext")?.GetValue(unitOfWork)) as DbContext;

        if (dbContext != null)
        {
            var genType = Type.GetType("ClinicEz.Clinic.Infrastructure.Services.PatientCodeGenerator, ClinicEz.Clinic.Infrastructure")
                ?? AppDomain.CurrentDomain.GetAssemblies()
                    .Select(a => a.GetType("ClinicEz.Clinic.Infrastructure.Services.PatientCodeGenerator"))
                    .FirstOrDefault(t => t != null);

            if (genType != null)
            {
                return (IPatientCodeGenerator)Activator.CreateInstance(genType, dbContext, null)!;
            }
        }

        throw new InvalidOperationException("IPatientCodeGenerator must be provided or registered in DI.");
    }

    public async Task<BulkRegisterPatientsResultDto> Handle(
        BulkRegisterClinicPatientsCommand request,
        CancellationToken ct)
    {
        if (request.Patients == null || request.Patients.Count == 0)
        {
            return new BulkRegisterPatientsResultDto(0, 0, Array.Empty<ClinicPatientDto>());
        }

        var year = DateTime.UtcNow.Year;
        const int maxAttempts = 3;

        var patientCodes = await _codeGenerator.ReserveBatchCodesAsync(
            _clinicContext.TenantId,
            _clinicContext.ClinicId,
            request.Patients.Count,
            year,
            ct);

        var createdEntities = new List<ClinicPatient>();
        var resultDtos = new List<ClinicPatientDto>();

        for (int i = 0; i < request.Patients.Count; i++)
        {
            var item = request.Patients[i];
            var patientCode = patientCodes[i];

            var customFields = item.CustomFields != null
                ? new Dictionary<string, object?>(item.CustomFields)
                : new Dictionary<string, object?>();

            if (!string.IsNullOrWhiteSpace(item.AddressLine) && !customFields.ContainsKey("primary_address_line"))
                customFields["primary_address_line"] = item.AddressLine.Trim();

            if (!string.IsNullOrWhiteSpace(item.Barangay) && !customFields.ContainsKey("primary_barangay"))
                customFields["primary_barangay"] = item.Barangay.Trim();

            if (!string.IsNullOrWhiteSpace(item.City) && !customFields.ContainsKey("primary_city"))
                customFields["primary_city"] = item.City.Trim();

            if (!string.IsNullOrWhiteSpace(item.Province) && !customFields.ContainsKey("primary_province"))
                customFields["primary_province"] = item.Province.Trim();

            if (!string.IsNullOrWhiteSpace(item.EmergencyContactName) && !customFields.ContainsKey("emergency_contact_name"))
                customFields["emergency_contact_name"] = item.EmergencyContactName.Trim();

            if (!string.IsNullOrWhiteSpace(item.EmergencyContactPhone) && !customFields.ContainsKey("emergency_contact_phone"))
                customFields["emergency_contact_phone"] = item.EmergencyContactPhone.Trim();

            if (!string.IsNullOrWhiteSpace(item.EmergencyContactRelationship) && !customFields.ContainsKey("emergency_contact_relationship"))
                customFields["emergency_contact_relationship"] = item.EmergencyContactRelationship.Trim();

            var patient = new ClinicPatient
            {
                Id = Guid.NewGuid(),
                TenantId = _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                PatientCode = patientCode,
                FirstName = item.FirstName.Trim(),
                LastName = item.LastName.Trim(),
                MiddleName = item.MiddleName?.Trim(),
                Suffix = item.Suffix?.Trim(),
                DateOfBirth = item.DateOfBirth,
                Gender = string.IsNullOrWhiteSpace(item.Gender) ? "Male" : item.Gender,
                CivilStatus = item.CivilStatus,
                ContactNumber = item.ContactNumber.Trim(),
                Email = item.Email?.Trim(),
                PhilHealthNumber = item.PhilHealthNumber?.Trim(),
                SeniorCitizenId = item.SeniorCitizenId?.Trim(),
                PwdId = item.PwdId?.Trim(),
                BloodType = item.BloodType?.Trim(),
                Allergies = item.Allergies?.Trim(),
                ChronicConditions = item.ChronicConditions?.Trim(),
                Alerts = item.Alerts?.Trim(),
                CustomFields = customFields,
                VerificationStatus = string.IsNullOrWhiteSpace(item.VerificationStatus) ? "PendingVerification" : item.VerificationStatus,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "BulkRegistrarImport"
            };

            await _patientRepo.AddAsync(patient, ct);
            createdEntities.Add(patient);
        }

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                await _unitOfWork.SaveChangesAsync(ct);
                break;
            }
            catch (DbUpdateException ex) when (PatientCodeCollisionDetector.IsPatientCodeCollision(ex))
            {
                if (attempt >= maxAttempts)
                {
                    throw new InvalidOperationException("Failed to bulk register patients after multiple sequence allocation attempts.", ex);
                }

                var newCodes = await _codeGenerator.ReserveBatchCodesAsync(
                    _clinicContext.TenantId,
                    _clinicContext.ClinicId,
                    createdEntities.Count,
                    year,
                    ct);

                for (int i = 0; i < createdEntities.Count; i++)
                {
                    createdEntities[i].PatientCode = newCodes[i];
                }
            }
        }

        foreach (var p in createdEntities)
        {
            resultDtos.Add(RegisterClinicPatientCommandHandler.MapToDto(p));
        }

        return new BulkRegisterPatientsResultDto(
            request.Patients.Count,
            createdEntities.Count,
            resultDtos
        );
    }
}
