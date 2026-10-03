using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

public sealed record PublicUploadedDocumentDto(
    string RecordType,
    string Title,
    string FileName,
    string StorageUri,
    string? Notes = null
);

public sealed record PublicStudentSelfEnrollCommand(
    string FirstName,
    string LastName,
    string? MiddleName,
    DateOnly DateOfBirth,
    string Gender,
    string ContactNumber,
    string? Email,
    string? AddressLine,
    string? Barangay,
    string? City,
    string? Province,
    string? EmergencyContactName,
    string? EmergencyContactPhone,
    string? EmergencyContactRelationship,
    string? BloodType,
    string StudentId,
    string? College,
    string? Program,
    string? YearLevel,
    Dictionary<string, object?>? AdditionalCustomFields = null,
    IReadOnlyList<PublicUploadedDocumentDto>? Documents = null
) : IRequest<PublicStudentSelfEnrollResultDto>;

public sealed record PublicStudentSelfEnrollResultDto(
    ClinicPatientDto Patient,
    string QueueToken,
    int AttachedDocumentsCount,
    string Message
);

public sealed class PublicStudentSelfEnrollCommandHandler
    : IRequestHandler<PublicStudentSelfEnrollCommand, PublicStudentSelfEnrollResultDto>
{
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<ClinicRecordAttachment> _attachmentRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public PublicStudentSelfEnrollCommandHandler(
        IRepository<ClinicPatient> patientRepo,
        IRepository<ClinicRecordAttachment> attachmentRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _patientRepo = patientRepo;
        _attachmentRepo = attachmentRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<PublicStudentSelfEnrollResultDto> Handle(
        PublicStudentSelfEnrollCommand request,
        CancellationToken ct)
    {
        var year = DateTime.UtcNow.Year;
        var count = await _patientRepo.Query()
            .CountAsync(p => p.CreatedAt.Year == year, ct);

        var patientCode = $"PAT-{year}-{(count + 1):D5}";
        var queueToken = $"Q-{(count % 500 + 1):D3}";

        var customFields = request.AdditionalCustomFields ?? new Dictionary<string, object?>();
        customFields["classification"] = "Student";
        customFields["student_id"] = request.StudentId.Trim();
        if (!string.IsNullOrWhiteSpace(request.College)) customFields["college"] = request.College.Trim();
        if (!string.IsNullOrWhiteSpace(request.Program)) customFields["program"] = request.Program.Trim();
        if (!string.IsNullOrWhiteSpace(request.YearLevel)) customFields["year_level"] = request.YearLevel.Trim();

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            PatientCode = patientCode,
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            MiddleName = request.MiddleName?.Trim(),
            DateOfBirth = request.DateOfBirth,
            Gender = string.IsNullOrWhiteSpace(request.Gender) ? "Male" : request.Gender,
            ContactNumber = request.ContactNumber.Trim(),
            Email = request.Email?.Trim(),
            AddressLine = request.AddressLine?.Trim(),
            Barangay = request.Barangay?.Trim(),
            City = request.City?.Trim(),
            Province = request.Province?.Trim(),
            EmergencyContactName = request.EmergencyContactName?.Trim(),
            EmergencyContactPhone = request.EmergencyContactPhone?.Trim(),
            EmergencyContactRelationship = request.EmergencyContactRelationship?.Trim(),
            BloodType = request.BloodType?.Trim(),
            CustomFields = customFields,
            VerificationStatus = "PendingVerification",
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "StudentSelfEnrollmentPortal"
        };

        await _patientRepo.AddAsync(patient, ct);

        var attachedCount = 0;
        if (request.Documents != null && request.Documents.Count > 0)
        {
            foreach (var doc in request.Documents)
            {
                var attachment = new ClinicRecordAttachment
                {
                    Id = Guid.NewGuid(),
                    TenantId = _clinicContext.TenantId,
                    ClinicId = _clinicContext.ClinicId,
                    PatientId = patient.Id,
                    RecordType = string.IsNullOrWhiteSpace(doc.RecordType) ? "OutsideChestXRay" : doc.RecordType,
                    Title = doc.Title.Trim(),
                    FileName = doc.FileName.Trim(),
                    ContentType = doc.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) ? "application/pdf" : "image/jpeg",
                    FileSizeBytes = 1024 * 500,
                    StorageUri = doc.StorageUri.Trim(),
                    DocumentDate = DateOnly.FromDateTime(DateTime.UtcNow),
                    Notes = doc.Notes?.Trim(),
                    UploadedByStaffName = "Student Self-Upload",
                    VerificationStatus = "PendingVerification",
                    CreatedAt = DateTime.UtcNow
                };

                await _attachmentRepo.AddAsync(attachment, ct);
                attachedCount++;
            }
        }

        await _unitOfWork.SaveChangesAsync(ct);

        var patientDto = RegisterClinicPatientCommandHandler.MapToDto(patient);

        return new PublicStudentSelfEnrollResultDto(
            patientDto,
            queueToken,
            attachedCount,
            "Student self-enrollment received. Please present your Digital Intake Slip at the campus clinic for physical verification."
        );
    }
}
