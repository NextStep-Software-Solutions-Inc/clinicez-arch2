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
        var prefixPattern = $"MC-{datePrefix}-";

        for (int attempt = 1; attempt <= 3; attempt++)
        {
            var existingCerts = await _medCertRepo.Query()
                .Where(m => m.TenantId == _clinicContext.TenantId && m.ClinicId == _clinicContext.ClinicId && m.IssueDate == today)
                .Select(m => m.CertificateNumber)
                .ToListAsync(ct);

            int maxSeq = 0;
            foreach (var num in existingCerts)
            {
                if (num.StartsWith(prefixPattern) && int.TryParse(num[prefixPattern.Length..], out var parsed) && parsed > maxSeq)
                {
                    maxSeq = parsed;
                }
            }

            var certNumber = $"{prefixPattern}{(maxSeq + attempt):D4}";

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

            try
            {
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
            catch (DbUpdateException) when (attempt < 3)
            {
                await Task.Delay(50 * attempt, ct);
            }
        }

        throw new InvalidOperationException("Failed to generate a unique medical certificate number after multiple attempts.");
    }
}
