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

public sealed record UpdateClinicPatientCommand(
    Guid Id,
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
    System.Collections.Generic.Dictionary<string, object?>? CustomFields = null,
    string? VerificationStatus = null) : IRequest<ClinicPatientDto>;

public sealed class UpdateClinicPatientCommandHandler : IRequestHandler<UpdateClinicPatientCommand, ClinicPatientDto>
{
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateClinicPatientCommandHandler(
        IRepository<ClinicPatient> patientRepo,
        IUnitOfWork unitOfWork)
    {
        _patientRepo = patientRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<ClinicPatientDto> Handle(UpdateClinicPatientCommand request, CancellationToken ct)
    {
        var patient = await _patientRepo.Query()
            .FirstOrDefaultAsync(p => p.Id == request.Id, ct);

        if (patient == null)
        {
            throw new KeyNotFoundException($"Patient with ID {request.Id} was not found.");
        }

        patient.FirstName = request.FirstName.Trim();
        patient.LastName = request.LastName.Trim();
        patient.MiddleName = request.MiddleName?.Trim();
        patient.Suffix = request.Suffix?.Trim();
        patient.DateOfBirth = request.DateOfBirth;
        patient.Gender = request.Gender;
        patient.CivilStatus = request.CivilStatus;
        patient.ContactNumber = request.ContactNumber.Trim();
        patient.Email = request.Email?.Trim();
        patient.AddressLine = request.AddressLine?.Trim();
        patient.Barangay = request.Barangay?.Trim();
        patient.City = request.City?.Trim();
        patient.Province = request.Province?.Trim();
        patient.EmergencyContactName = request.EmergencyContactName?.Trim();
        patient.EmergencyContactPhone = request.EmergencyContactPhone?.Trim();
        patient.EmergencyContactRelationship = request.EmergencyContactRelationship?.Trim();
        patient.PhilHealthNumber = request.PhilHealthNumber?.Trim();
        patient.SeniorCitizenId = request.SeniorCitizenId?.Trim();
        patient.PwdId = request.PwdId?.Trim();
        patient.BloodType = request.BloodType?.Trim();
        patient.Allergies = request.Allergies?.Trim();
        patient.ChronicConditions = request.ChronicConditions?.Trim();
        patient.Alerts = request.Alerts?.Trim();
        if (request.CustomFields != null)
        {
            patient.CustomFields = request.CustomFields;
        }
        if (!string.IsNullOrWhiteSpace(request.VerificationStatus))
        {
            patient.VerificationStatus = request.VerificationStatus;
        }
        patient.UpdatedAt = DateTime.UtcNow;
        patient.UpdatedBy = "ClinicStaff";

        await _unitOfWork.SaveChangesAsync(ct);

        return RegisterClinicPatientCommandHandler.MapToDto(patient);
    }
}
