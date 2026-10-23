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
    private readonly IPatientCodeGenerator _codeGenerator;

    public PublicStudentSelfEnrollCommandHandler(
        IRepository<ClinicPatient> patientRepo,
        IRepository<ClinicRecordAttachment> attachmentRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IPatientCodeGenerator? codeGenerator = null)
    {
        _patientRepo = patientRepo;
        _attachmentRepo = attachmentRepo;
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

    public async Task<PublicStudentSelfEnrollResultDto> Handle(
        PublicStudentSelfEnrollCommand request,
        CancellationToken ct)
    {
        var year = DateTime.UtcNow.Year;
        const int maxAttempts = 3;
        var reservation = await _codeGenerator.ReserveNextAsync(
            _clinicContext.TenantId,
            _clinicContext.ClinicId,
            year,
            ct);

        var patientCode = reservation.PatientCode;
        var queueToken = $"Q-{((reservation.Sequence - 1) % 500 + 1):D3}";

        var customFields = request.AdditionalCustomFields != null
            ? new Dictionary<string, object?>(request.AdditionalCustomFields)
            : new Dictionary<string, object?>();

        customFields["classification"] = "Student";
        customFields["student_id"] = request.StudentId.Trim();
        if (!string.IsNullOrWhiteSpace(request.College)) customFields["college"] = request.College.Trim();
        if (!string.IsNullOrWhiteSpace(request.Program)) customFields["program"] = request.Program.Trim();
        if (!string.IsNullOrWhiteSpace(request.YearLevel)) customFields["year_level"] = request.YearLevel.Trim();

        if (!string.IsNullOrWhiteSpace(request.AddressLine) && !customFields.ContainsKey("primary_address_line"))
            customFields["primary_address_line"] = request.AddressLine.Trim();

        if (!string.IsNullOrWhiteSpace(request.Barangay) && !customFields.ContainsKey("primary_barangay"))
            customFields["primary_barangay"] = request.Barangay.Trim();

        if (!string.IsNullOrWhiteSpace(request.City) && !customFields.ContainsKey("primary_city"))
            customFields["primary_city"] = request.City.Trim();

        if (!string.IsNullOrWhiteSpace(request.Province) && !customFields.ContainsKey("primary_province"))
            customFields["primary_province"] = request.Province.Trim();

        if (!string.IsNullOrWhiteSpace(request.EmergencyContactName) && !customFields.ContainsKey("emergency_contact_name"))
            customFields["emergency_contact_name"] = request.EmergencyContactName.Trim();

        if (!string.IsNullOrWhiteSpace(request.EmergencyContactPhone) && !customFields.ContainsKey("emergency_contact_phone"))
            customFields["emergency_contact_phone"] = request.EmergencyContactPhone.Trim();

        if (!string.IsNullOrWhiteSpace(request.EmergencyContactRelationship) && !customFields.ContainsKey("emergency_contact_relationship"))
            customFields["emergency_contact_relationship"] = request.EmergencyContactRelationship.Trim();

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
                    EncryptionAlgorithm = "AES-256-GCM",
                    EncryptionKeyId = "cmk-v1",
                    CreatedAt = DateTime.UtcNow
                };

                await _attachmentRepo.AddAsync(attachment, ct);
                attachedCount++;
            }
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
                    throw new InvalidOperationException("Failed to self-enroll student after multiple sequence allocation attempts.", ex);
                }

                var newReservation = await _codeGenerator.ReserveNextAsync(
                    _clinicContext.TenantId,
                    _clinicContext.ClinicId,
                    year,
                    ct);

                patient.PatientCode = newReservation.PatientCode;
                queueToken = $"Q-{((newReservation.Sequence - 1) % 500 + 1):D3}";
            }
        }

        var patientDto = RegisterClinicPatientCommandHandler.MapToDto(patient);

        return new PublicStudentSelfEnrollResultDto(
            patientDto,
            queueToken,
            attachedCount,
            "Student self-enrollment received. Please present your Digital Intake Slip at the campus clinic for physical verification."
        );
    }
}
