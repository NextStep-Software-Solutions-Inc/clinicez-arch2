using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

public sealed record RegisterClinicPatientCommand(
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
    Guid? SyncPatientId = null) : IRequest<ClinicPatientDto>;

public sealed class RegisterClinicPatientCommandHandler : IRequestHandler<RegisterClinicPatientCommand, ClinicPatientDto>
{
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public RegisterClinicPatientCommandHandler(
        IRepository<ClinicPatient> patientRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _patientRepo = patientRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<ClinicPatientDto> Handle(RegisterClinicPatientCommand request, CancellationToken ct)
    {
        var year = DateTime.UtcNow.Year;
        var count = await _patientRepo.Query()
            .CountAsync(p => p.CreatedAt.Year == year, ct);

        var patientCode = $"PAT-{year}-{(count + 1):D5}";

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            PatientCode = patientCode,
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            MiddleName = request.MiddleName?.Trim(),
            Suffix = request.Suffix?.Trim(),
            DateOfBirth = request.DateOfBirth,
            Gender = string.IsNullOrWhiteSpace(request.Gender) ? "Male" : request.Gender,
            CivilStatus = request.CivilStatus,
            ContactNumber = request.ContactNumber.Trim(),
            Email = request.Email?.Trim(),
            AddressLine = request.AddressLine?.Trim(),
            Barangay = request.Barangay?.Trim(),
            City = request.City?.Trim(),
            Province = request.Province?.Trim(),
            EmergencyContactName = request.EmergencyContactName?.Trim(),
            EmergencyContactPhone = request.EmergencyContactPhone?.Trim(),
            EmergencyContactRelationship = request.EmergencyContactRelationship?.Trim(),
            PhilHealthNumber = request.PhilHealthNumber?.Trim(),
            SeniorCitizenId = request.SeniorCitizenId?.Trim(),
            PwdId = request.PwdId?.Trim(),
            BloodType = request.BloodType?.Trim(),
            Allergies = request.Allergies?.Trim(),
            ChronicConditions = request.ChronicConditions?.Trim(),
            Alerts = request.Alerts?.Trim(),
            SyncPatientId = request.SyncPatientId,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "ClinicStaff"
        };

        await _patientRepo.AddAsync(patient, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return MapToDto(patient);
    }

    public static ClinicPatientDto MapToDto(ClinicPatient p)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var age = today.Year - p.DateOfBirth.Year;
        if (p.DateOfBirth > today.AddYears(-age)) age--;

        var middleInitial = !string.IsNullOrWhiteSpace(p.MiddleName) ? $" {p.MiddleName[0]}." : "";
        var suffix = !string.IsNullOrWhiteSpace(p.Suffix) ? $" {p.Suffix}" : "";
        var fullName = $"{p.LastName}, {p.FirstName}{middleInitial}{suffix}";

        return new ClinicPatientDto(
            p.Id,
            p.TenantId,
            p.ClinicId,
            p.PatientCode,
            p.FirstName,
            p.LastName,
            p.MiddleName,
            p.Suffix,
            fullName,
            p.DateOfBirth,
            age,
            p.Gender,
            p.CivilStatus,
            p.ContactNumber,
            p.Email,
            p.AddressLine,
            p.Barangay,
            p.City,
            p.Province,
            p.EmergencyContactName,
            p.EmergencyContactPhone,
            p.EmergencyContactRelationship,
            p.PhilHealthNumber,
            p.SeniorCitizenId,
            p.PwdId,
            p.BloodType,
            p.Allergies,
            p.ChronicConditions,
            p.Alerts,
            p.SyncPatientId,
            p.CreatedAt);
    }
}
