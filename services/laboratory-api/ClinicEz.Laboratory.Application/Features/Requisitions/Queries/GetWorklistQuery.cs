using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Application.Features.Requisitions.Queries;

public record GetWorklistQuery(
    RequisitionStatus? Status = null,
    string? SearchTerm = null,
    string? BranchId = null,
    int PageNumber = 1,
    int PageSize = 50,
    RequisitionStage? Stage = null
) : IRequest<List<LabRequisitionDto>>;

public class GetWorklistQueryHandler : IRequestHandler<GetWorklistQuery, List<LabRequisitionDto>>
{
    private readonly IRepository<LabRequisition> _requisitionRepository;

    public GetWorklistQueryHandler(IRepository<LabRequisition> requisitionRepository)
    {
        _requisitionRepository = requisitionRepository;
    }

    public async Task<List<LabRequisitionDto>> Handle(GetWorklistQuery request, CancellationToken cancellationToken)
    {
        var query = _requisitionRepository.Query()
            .Include(r => r.Specimens)
            .Include(r => r.AnalyteResults)
            .Include(r => r.DiagnosticReport)
            .AsNoTracking();

        if (request.Status is { } status)
        {
            query = query.Where(r => r.Status == status);
        }

        if (request.Stage is { } stage)
        {
            query = query.Where(r => r.Stage == stage);
        }

        if (!string.IsNullOrWhiteSpace(request.BranchId))
        {
            query = query.Where(r => r.BranchId == request.BranchId);
        }

        if (!string.IsNullOrWhiteSpace(request.SearchTerm))
        {
            var term = request.SearchTerm.Trim().ToLower();
            query = query.Where(r =>
                r.AccessionNumber.ToLower().Contains(term) ||
                r.PatientName.ToLower().Contains(term) ||
                r.OrderingDoctorName.ToLower().Contains(term) ||
                r.OrderingFacilityName.ToLower().Contains(term));
        }

        var items = await query
            .OrderByDescending(r => r.CreatedAt)
            .Skip((request.PageNumber - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync(cancellationToken);

        return items.Select(r => MapToDto(r)).ToList();
    }

    public static LabRequisitionDto MapToDto(LabRequisition r)
    {
        return new LabRequisitionDto
        {
            Id = r.Id,
            BranchId = r.BranchId,
            ExternalRequisitionId = r.ExternalRequisitionId,
            AccessionNumber = r.AccessionNumber,
            OrderingFacilityName = r.OrderingFacilityName,
            OrderingDoctorName = r.OrderingDoctorName,
            OrderingDoctorPrc = r.OrderingDoctorPrc,
            PatientId = r.PatientId,
            PatientName = r.PatientName,
            PhilHealthPin = r.PhilHealthPin,
            PatientAge = r.PatientAge,
            PatientGender = r.PatientGender,
            ContactNumber = r.ContactNumber,
            ClinicalDiagnosis = r.ClinicalDiagnosis,
            FastingInstructions = r.FastingInstructions,
            Urgency = r.Urgency,
            Status = r.Status.ToString(),
            Stage = r.Stage.ToString(),
            StageReason = r.StageReason,
            PaymentPolicy = r.PaymentPolicy.ToString(),
            QuotedAmount = r.QuotedAmount,
            Currency = r.Currency,
            PaymentRequired = r.IsPaymentBlocking,
            Paid = r.PaidAtUtc != null,
            PaidAtUtc = r.PaidAtUtc,
            ReceiptNumber = r.ReceiptNumber,
            InvoiceId = r.InvoiceId,
            PaymentCorrection = r.PaymentCorrection.ToString(),
            PaymentCorrectedAtUtc = r.PaymentCorrectedAtUtc,
            DoctorReviewOutcome = r.DoctorReviewOutcome.ToString(),
            DoctorReviewedAtUtc = r.DoctorReviewedAtUtc,
            DoctorReviewedByName = r.DoctorReviewedByName,
            DoctorReviewRemarks = r.DoctorReviewRemarks,
            CreatedAt = r.CreatedAt,
            Specimens = r.Specimens.Select(s => new SpecimenDto
            {
                Id = s.Id,
                Barcode = s.Barcode,
                ContainerType = s.ContainerType.ToString(),
                SpecimenType = s.SpecimenType,
                Status = s.Status.ToString(),
                CollectedAt = s.CollectedAt,
                CollectedByPhlebotomistName = s.CollectedByPhlebotomistName,
                ReceivedInLabAt = s.ReceivedInLabAt,
                Notes = s.Notes,
                RejectionReason = s.RejectionReason.ToString(),
                RejectionNotes = s.RejectionNotes,
                RejectedAt = s.RejectedAt,
                RejectedByPhlebotomistName = s.RejectedByPhlebotomistName,
                CorrectiveAction = s.CorrectiveAction,
                RackId = s.RackId,
                RackPosition = s.RackPosition,
                StorageTemperature = s.StorageTemperature.ToString(),
                StorageStatus = s.StorageStatus.ToString(),
                StoredAt = s.StoredAt,
                DisposedAt = s.DisposedAt
            }).ToList(),
            AnalyteResults = r.AnalyteResults.Select(a => new AnalyteResultDto
            {
                Id = a.Id,
                PanelName = a.PanelName,
                AnalyteCode = a.AnalyteCode,
                AnalyteName = a.AnalyteName,
                Value = a.Value,
                Unit = a.Unit,
                ReferenceInterval = a.ReferenceInterval,
                Flag = a.Flag.ToString(),
                Interpretation = a.Interpretation,
                EnteredByMedTechName = a.EnteredByMedTechName,
                EnteredAt = a.EnteredAt
            }).ToList(),
            DiagnosticReport = r.DiagnosticReport == null ? null : new DiagnosticReportDto
            {
                Id = r.DiagnosticReport.Id,
                ReportNumber = r.DiagnosticReport.ReportNumber,
                ReleasedAt = r.DiagnosticReport.ReleasedAt,
                PathologistName = r.DiagnosticReport.PathologistName,
                PathologistPrcLicense = r.DiagnosticReport.PathologistPrcLicense,
                MedicalTechnologistName = r.DiagnosticReport.MedicalTechnologistName,
                MedicalTechnologistPrcLicense = r.DiagnosticReport.MedicalTechnologistPrcLicense,
                PathologistImpression = r.DiagnosticReport.PathologistImpression,
                IsCriticalResult = r.DiagnosticReport.IsCriticalResult,
                SignedPdfBase64 = r.DiagnosticReport.SignedPdfBase64
            }
        };
    }
}
