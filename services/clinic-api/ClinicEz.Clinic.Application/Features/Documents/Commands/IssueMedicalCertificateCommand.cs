using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Documents.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Documents.Commands;

public sealed record IssueMedicalCertificateCommand(
    Guid PatientId,
    string PatientName,
    Guid? ConsultationId,
    Guid DoctorId,
    string DoctorName,
    string PrcLicenseNumber,
    string? PtrNumber,
    string Diagnosis,
    string? ClinicalFindings,
    string FitnessStatus = "FitToWork",
    int? RecommendedRestDays = null,
    DateOnly? RestStartDate = null,
    DateOnly? RestEndDate = null,
    string Purpose = "Employment",
    string? Remarks = null) : IRequest<MedicalCertificateDto>;

public sealed class IssueMedicalCertificateCommandHandler : IRequestHandler<IssueMedicalCertificateCommand, MedicalCertificateDto>
{
    private readonly IRepository<MedicalCertificate> _medCertRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public IssueMedicalCertificateCommandHandler(
        IRepository<MedicalCertificate> medCertRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _medCertRepo = medCertRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<MedicalCertificateDto> Handle(IssueMedicalCertificateCommand request, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var datePrefix = today.ToString("yyyyMMdd");

        var count = await _medCertRepo.Query()
            .CountAsync(m => m.IssueDate == today, ct);

        var certNumber = $"MC-{datePrefix}-{(count + 1):D4}";

        var cert = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            CertificateNumber = certNumber,
            PatientId = request.PatientId,
            PatientName = request.PatientName.Trim(),
            ConsultationId = request.ConsultationId,
            DoctorId = request.DoctorId,
            DoctorName = request.DoctorName.Trim(),
            PrcLicenseNumber = request.PrcLicenseNumber.Trim(),
            PtrNumber = request.PtrNumber?.Trim(),
            IssueDate = today,
            Diagnosis = request.Diagnosis.Trim(),
            ClinicalFindings = request.ClinicalFindings?.Trim(),
            FitnessStatus = string.IsNullOrWhiteSpace(request.FitnessStatus) ? "FitToWork" : request.FitnessStatus,
            RecommendedRestDays = request.RecommendedRestDays,
            RestStartDate = request.RestStartDate,
            RestEndDate = request.RestEndDate,
            Purpose = string.IsNullOrWhiteSpace(request.Purpose) ? "Employment" : request.Purpose,
            Remarks = request.Remarks?.Trim(),
            IsSigned = true,
            SignedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = request.DoctorName
        };

        await _medCertRepo.AddAsync(cert, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return new MedicalCertificateDto(
            cert.Id,
            cert.TenantId,
            cert.ClinicId,
            cert.CertificateNumber,
            cert.PatientId,
            cert.PatientName,
            cert.ConsultationId,
            cert.DoctorId,
            cert.DoctorName,
            cert.PrcLicenseNumber,
            cert.PtrNumber,
            cert.IssueDate,
            cert.Diagnosis,
            cert.ClinicalFindings,
            cert.FitnessStatus,
            cert.RecommendedRestDays,
            cert.RestStartDate,
            cert.RestEndDate,
            cert.Purpose,
            cert.Remarks,
            cert.IsSigned,
            cert.SignedAt,
            cert.CreatedAt);
    }
}
