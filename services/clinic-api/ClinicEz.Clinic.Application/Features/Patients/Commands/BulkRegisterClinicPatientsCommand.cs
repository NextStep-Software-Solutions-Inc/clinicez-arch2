using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
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

    public BulkRegisterClinicPatientsCommandHandler(
        IRepository<ClinicPatient> patientRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _patientRepo = patientRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
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
        var prefix = $"PAT-{year}-";
        var existingCodes = await _patientRepo.Query(
            p => p.ClinicId == _clinicContext.ClinicId && p.PatientCode != null && p.PatientCode.StartsWith(prefix),
            ignoreQueryFilters: true)
            .Select(p => p.PatientCode)
            .ToListAsync(ct);

        var maxSeq = 0;
        foreach (var code in existingCodes)
        {
            if (!string.IsNullOrEmpty(code) && code.Length > prefix.Length)
            {
                var suffix = code.Substring(prefix.Length);
                if (int.TryParse(suffix, out var parsed) && parsed > maxSeq)
                {
                    maxSeq = parsed;
                }
            }
        }

        var createdEntities = new List<ClinicPatient>();
        var resultDtos = new List<ClinicPatientDto>();

        var seq = maxSeq;
        foreach (var item in request.Patients)
        {
            seq++;
            var patientCode = $"{prefix}{seq:D5}";

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
                AddressLine = item.AddressLine?.Trim(),
                Barangay = item.Barangay?.Trim(),
                City = item.City?.Trim(),
                Province = item.Province?.Trim(),
                EmergencyContactName = item.EmergencyContactName?.Trim(),
                EmergencyContactPhone = item.EmergencyContactPhone?.Trim(),
                EmergencyContactRelationship = item.EmergencyContactRelationship?.Trim(),
                PhilHealthNumber = item.PhilHealthNumber?.Trim(),
                SeniorCitizenId = item.SeniorCitizenId?.Trim(),
                PwdId = item.PwdId?.Trim(),
                BloodType = item.BloodType?.Trim(),
                Allergies = item.Allergies?.Trim(),
                ChronicConditions = item.ChronicConditions?.Trim(),
                Alerts = item.Alerts?.Trim(),
                CustomFields = item.CustomFields ?? new Dictionary<string, object?>(),
                VerificationStatus = string.IsNullOrWhiteSpace(item.VerificationStatus) ? "PendingVerification" : item.VerificationStatus,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "BulkRegistrarImport"
            };

            await _patientRepo.AddAsync(patient, ct);
            createdEntities.Add(patient);

            resultDtos.Add(RegisterClinicPatientCommandHandler.MapToDto(patient));
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return new BulkRegisterPatientsResultDto(
            request.Patients.Count,
            createdEntities.Count,
            resultDtos
        );
    }
}
