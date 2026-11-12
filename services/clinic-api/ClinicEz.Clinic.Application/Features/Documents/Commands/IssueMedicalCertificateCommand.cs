using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Documents.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Documents.Security;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

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
    string? Remarks = null,
    Guid? QueueItemId = null) : IRequest<MedicalCertificateDto>;

public sealed class IssueMedicalCertificateCommandHandler : IRequestHandler<IssueMedicalCertificateCommand, MedicalCertificateDto>
{
    private readonly IRepository<MedicalCertificate> _medCertRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IClinicIdentityProvider _clinicIdentity;
    private readonly IPatientDocumentPublisher _documents;
    private readonly IDocumentSecurityService _security;
    private readonly IConfiguration _configuration;
    private readonly IRepository<ConsultationEncounter>? _consultationRepo;
    private readonly IRepository<QueueItem>? _queueRepo;

    public IssueMedicalCertificateCommandHandler(
        IRepository<MedicalCertificate> medCertRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IClinicIdentityProvider clinicIdentity,
        IPatientDocumentPublisher documents,
        IDocumentSecurityService security,
        IConfiguration configuration,
        IRepository<ConsultationEncounter>? consultationRepo = null,
        IRepository<QueueItem>? queueRepo = null)
    {
        _medCertRepo = medCertRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _clinicIdentity = clinicIdentity;
        _documents = documents;
        _security = security;
        _configuration = configuration;
        _consultationRepo = consultationRepo;
        _queueRepo = queueRepo;
    }

    /// <summary>
    /// Queues the certificate for the patient's account in the interop outbox (committed with the certificate). The
    /// verification link is the one printed as the QR code on the certificate PDF.
    /// </summary>
    private async Task PublishPatientDocumentAsync(MedicalCertificate cert, CancellationToken ct)
    {
        var clinic = await _clinicIdentity.GetAsync(ct);
        if (clinic == null) return;

        var issuedAt = cert.SignedAt ?? cert.CreatedAt;
        var digest = cert.SecurityDigest ?? _security.ComputeDocumentDigest(
            cert.TenantId, "MED-CERT", cert.CertificateNumber, cert.PatientId, cert.PrcLicenseNumber, issuedAt);
        var verifyUrl = _security.GenerateVerificationUrl(
            VerificationUrlResolver.Resolve(_configuration), "med-cert", cert.CertificateNumber, digest);

        await _documents.PublishAsync(new PatientDocumentDraft(
            cert.ClinicId,
            cert.PatientId,
            cert.Id,
            PatientDocumentKind.MedicalCertificate,
            $"Medical certificate {cert.CertificateNumber}",
            issuedAt,
            Status: "Issued",
            VerificationToken: cert.CertificateNumber,
            VerificationUrl: verifyUrl,
            Body: new MedicalCertificateIssuedPayload
            {
                CertificateId = cert.Id,
                CertificateNumber = cert.CertificateNumber,
                PatientId = cert.PatientId,
                PatientName = cert.PatientName,
                IssuerTenantId = clinic.TenantId,
                IssuerFacilityId = clinic.ClinicId.ToString(),
                IssuerName = clinic.Name,
                DoctorName = cert.DoctorName,
                DoctorPrcLicense = cert.PrcLicenseNumber,
                DoctorPtrNumber = cert.PtrNumber,
                Purpose = cert.Purpose,
                Diagnosis = cert.Diagnosis,
                Remarks = cert.Remarks,
                RestDays = cert.RecommendedRestDays,
                ValidFrom = cert.RestStartDate?.ToDateTime(TimeOnly.MinValue),
                ValidTo = cert.RestEndDate?.ToDateTime(TimeOnly.MinValue),
                IssuedAtUtc = issuedAt,
                VerificationToken = cert.CertificateNumber,
                VerificationUrl = verifyUrl
            }), ct);
    }

    public async Task<MedicalCertificateDto> Handle(IssueMedicalCertificateCommand request, CancellationToken ct)
    {
        Guid? resolvedConsultationId = request.ConsultationId;
        Guid? resolvedQueueItemId = request.QueueItemId;
        bool isPendingConsultationSignOff = false;

        if (resolvedConsultationId.HasValue && _consultationRepo != null)
        {
            var encounter = await _consultationRepo
                .Query(c => c.Id == resolvedConsultationId.Value && c.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(ct);

            if (encounter != null)
            {
                resolvedQueueItemId ??= encounter.QueueItemId;
                if (!encounter.IsSigned)
                {
                    isPendingConsultationSignOff = true;
                }
            }
        }

        if (!isPendingConsultationSignOff && resolvedQueueItemId.HasValue && _queueRepo != null)
        {
            var queueItem = await _queueRepo
                .Query(q => q.Id == resolvedQueueItemId.Value && q.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(ct);

            if (queueItem != null && queueItem.VisitType == VisitType.Consultation)
            {
                if (_consultationRepo != null)
                {
                    var linkedConsultation = await _consultationRepo
                        .Query(c => c.QueueItemId == queueItem.Id && c.ClinicId == _clinicContext.ClinicId)
                        .OrderByDescending(c => c.EncounterDate)
                        .FirstOrDefaultAsync(ct);

                    if (linkedConsultation != null)
                    {
                        resolvedConsultationId ??= linkedConsultation.Id;
                        if (!linkedConsultation.IsSigned)
                        {
                            isPendingConsultationSignOff = true;
                        }
                    }
                    else if (!queueItem.IsDirectVisit)
                    {
                        isPendingConsultationSignOff = true;
                    }
                }
                else
                {
                    isPendingConsultationSignOff = queueItem.Status != QueueStatus.Completed;
                }
            }
        }

        if (isPendingConsultationSignOff && resolvedConsultationId.HasValue)
        {
            var existingDraft = await _medCertRepo.Query(m =>
                    m.ClinicId == _clinicContext.ClinicId &&
                    !m.IsSigned &&
                    (m.ConsultationId == resolvedConsultationId.Value ||
                     (resolvedQueueItemId.HasValue && m.QueueItemId == resolvedQueueItemId.Value)))
                .OrderByDescending(m => m.CreatedAt)
                .FirstOrDefaultAsync(ct);

            if (existingDraft != null)
            {
                existingDraft.ConsultationId = resolvedConsultationId;
                existingDraft.QueueItemId ??= resolvedQueueItemId;
                existingDraft.PatientId = request.PatientId;
                existingDraft.PatientName = request.PatientName.Trim();
                existingDraft.DoctorId = request.DoctorId;
                existingDraft.DoctorName = request.DoctorName.Trim();
                existingDraft.PrcLicenseNumber = request.PrcLicenseNumber.Trim();
                existingDraft.PtrNumber = request.PtrNumber?.Trim();
                existingDraft.Diagnosis = request.Diagnosis.Trim();
                existingDraft.ClinicalFindings = request.ClinicalFindings?.Trim();
                existingDraft.FitnessStatus = string.IsNullOrWhiteSpace(request.FitnessStatus) ? "FitToWork" : request.FitnessStatus;
                existingDraft.RecommendedRestDays = request.RecommendedRestDays;
                existingDraft.RestStartDate = request.RestStartDate;
                existingDraft.RestEndDate = request.RestEndDate;
                existingDraft.Purpose = string.IsNullOrWhiteSpace(request.Purpose) ? "Employment" : request.Purpose;
                existingDraft.Remarks = request.Remarks?.Trim();
                existingDraft.UpdatedAt = DateTime.UtcNow;
                existingDraft.UpdatedBy = request.DoctorName.Trim();

                _medCertRepo.Update(existingDraft);
                await _unitOfWork.SaveChangesAsync(ct);

                return new MedicalCertificateDto(
                    existingDraft.Id,
                    existingDraft.TenantId,
                    existingDraft.ClinicId,
                    existingDraft.CertificateNumber,
                    existingDraft.PatientId,
                    existingDraft.PatientName,
                    existingDraft.ConsultationId,
                    existingDraft.DoctorId,
                    existingDraft.DoctorName,
                    existingDraft.PrcLicenseNumber,
                    existingDraft.PtrNumber,
                    existingDraft.IssueDate,
                    existingDraft.Diagnosis,
                    existingDraft.ClinicalFindings,
                    existingDraft.FitnessStatus,
                    existingDraft.RecommendedRestDays,
                    existingDraft.RestStartDate,
                    existingDraft.RestEndDate,
                    existingDraft.Purpose,
                    existingDraft.Remarks,
                    existingDraft.IsSigned,
                    existingDraft.SignedAt,
                    existingDraft.CreatedAt,
                    existingDraft.SecurityDigest,
                    existingDraft.QueueItemId);
            }
        }

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
            var issuedAt = DateTime.UtcNow;
            var digest = isPendingConsultationSignOff
                ? null
                : _security.ComputeDocumentDigest(
                    _clinicContext.TenantId, "MED-CERT", certNumber, request.PatientId, request.PrcLicenseNumber.Trim(), issuedAt);

            var cert = new MedicalCertificate
            {
                Id = Guid.NewGuid(),
                TenantId = _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                CertificateNumber = certNumber,
                PatientId = request.PatientId,
                PatientName = request.PatientName.Trim(),
                ConsultationId = resolvedConsultationId,
                QueueItemId = resolvedQueueItemId,
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
                IsSigned = !isPendingConsultationSignOff,
                SignedAt = isPendingConsultationSignOff ? null : issuedAt,
                CreatedAt = issuedAt,
                CreatedBy = request.DoctorName,
                SecurityDigest = digest
            };

            try
            {
                await _medCertRepo.AddAsync(cert, ct);
                if (cert.IsSigned)
                {
                    await PublishPatientDocumentAsync(cert, ct);
                }
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
                    cert.CreatedAt,
                    cert.SecurityDigest,
                    cert.QueueItemId);
            }
            catch (DbUpdateException) when (attempt < 3)
            {
                await Task.Delay(50 * attempt, ct);
            }
        }

        throw new InvalidOperationException("Failed to generate a unique medical certificate number after multiple attempts.");
    }
}
