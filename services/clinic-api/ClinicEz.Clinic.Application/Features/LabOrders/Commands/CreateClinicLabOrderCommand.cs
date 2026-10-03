using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.LabOrders.Commands;

public record CreateClinicLabOrderCommand(
    Guid PatientId,
    string PatientName,
    Guid? ConsultationId = null,
    Guid? OrderedByDoctorId = null,
    string? OrderedByDoctorName = null,
    string? ClinicalDiagnosis = null,
    string? Notes = null,
    List<CreateLabOrderItemRequest>? Items = null,
    string? TargetFacilityId = null,
    string? TargetTenantId = null
) : IRequest<ClinicLabOrderDto>;

public class CreateClinicLabOrderCommandHandler : IRequestHandler<CreateClinicLabOrderCommand, ClinicLabOrderDto>
{
    private readonly IRepository<ClinicLabOrder> _orderRepo;
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly ILabRequisitionPublisher? _requisitionPublisher;

    public CreateClinicLabOrderCommandHandler(
        IRepository<ClinicLabOrder> orderRepo,
        IRepository<ClinicPatient> patientRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        ILabRequisitionPublisher? requisitionPublisher = null)
    {
        _orderRepo = orderRepo;
        _patientRepo = patientRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _requisitionPublisher = requisitionPublisher;
    }

    public async Task<ClinicLabOrderDto> Handle(CreateClinicLabOrderCommand request, CancellationToken cancellationToken)
    {
        if (request.PatientId == Guid.Empty || string.IsNullOrWhiteSpace(request.PatientName))
        {
            throw new BadRequestException("PatientId and PatientName are required to create a lab order.");
        }

        var today = DateTime.UtcNow.Date;
        var tomorrow = today.AddDays(1);
        var todayCount = await _orderRepo.Query(o => o.OrderDate >= today && o.OrderDate < tomorrow)
            .CountAsync(cancellationToken);

        var dateTag = today.ToString("yyyyMMdd");
        var orderNumber = $"LAB-{dateTag}-{(todayCount + 1):D3}";
        var uploadToken = Guid.NewGuid().ToString("N")[..16];

        var items = new List<ClinicLabOrderItem>();
        if (request.Items != null && request.Items.Any())
        {
            foreach (var item in request.Items)
            {
                items.Add(new ClinicLabOrderItem
                {
                    TestName = item.TestName.Trim(),
                    Category = string.IsNullOrWhiteSpace(item.Category) ? "Diagnostic" : item.Category.Trim(),
                    Instructions = item.Instructions?.Trim(),
                    Status = LabOrderStatus.Ordered
                });
            }
        }
        else
        {
            // Default CBC request if none specified
            items.Add(new ClinicLabOrderItem
            {
                TestName = "Complete Blood Count (CBC) with Platelet",
                Category = "Hematology",
                Instructions = "Standard EDTA whole blood tube",
                Status = LabOrderStatus.Ordered
            });
        }

        var order = new ClinicLabOrder
        {
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            OrderNumber = orderNumber,
            PatientId = request.PatientId,
            PatientName = request.PatientName.Trim(),
            ConsultationId = request.ConsultationId,
            OrderedByDoctorId = request.OrderedByDoctorId,
            OrderedByDoctorName = request.OrderedByDoctorName?.Trim(),
            OrderDate = DateTime.UtcNow,
            Status = LabOrderStatus.Ordered,
            ClinicalDiagnosis = request.ClinicalDiagnosis?.Trim(),
            Notes = request.Notes?.Trim(),
            PublicUploadToken = uploadToken,
            Items = items
        };

        await _orderRepo.AddAsync(order, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Fetch patient demographics for the interoperability event payload
        var patient = await _patientRepo.GetByIdAsync(request.PatientId, cancellationToken);

        // Publish LabRequisitionIssuedEvent to RabbitMQ for ClinicEz Labs (Path A)
        if (_requisitionPublisher != null)
        {
            var requisitionEvent = new LabRequisitionIssuedEvent
            {
                RequisitionId = order.Id,
                AccessionNumber = order.OrderNumber,
                OrderingFacilityId = _clinicContext.ClinicId.ToString(),
                OrderingFacilityName = "ClinicEz Primary Care Clinic",
                TenantId = _clinicContext.TenantId ?? "tenant-default",
                TargetFacilityId = request.TargetFacilityId,
                TargetTenantId = request.TargetTenantId,
                OrderingDoctor = new OrderingDoctorDto
                {
                    DoctorId = request.OrderedByDoctorId?.ToString() ?? "doc-001",
                    DoctorName = request.OrderedByDoctorName ?? "Dr. Cruz",
                    PrcLicenseNumber = "0149281",
                    PtrNumber = "PTR-2026-9912",
                    Specialization = "Family Medicine"
                },
                Patient = new RequisitionPatientDto
                {
                    PatientId = request.PatientId,
                    FullName = request.PatientName.Trim(),
                    PhilHealthPin = patient?.PhilHealthNumber,
                    NationalId = patient?.SeniorCitizenId ?? patient?.PwdId,
                    DateOfBirth = patient?.DateOfBirth.ToString("yyyy-MM-dd"),
                    Age = patient != null ? DateTime.UtcNow.Year - patient.DateOfBirth.Year : 40,
                    Gender = patient?.Gender.ToString() ?? "Unknown",
                    ContactNumber = patient?.ContactNumber
                },
                Icd10Code = request.ClinicalDiagnosis,
                ProvisionalDiagnosis = request.ClinicalDiagnosis,
                FastingInstructions = request.Notes,
                Urgency = "Routine",
                Items = items.Select(i => new RequisitionItemDto
                {
                    ItemCode = i.TestName.ToUpperInvariant().Replace(" ", "_")[..Math.Min(i.TestName.Length, 15)],
                    ItemName = i.TestName,
                    Category = i.Category,
                    Urgency = "Routine",
                    SpecimenRequirement = i.Instructions
                }).ToList(),
                PublicUploadToken = uploadToken,
                PublicUploadUrl = $"/api/v1/public/lab-upload/{uploadToken}",
                IssuedAt = order.OrderDate
            };

            await _requisitionPublisher.PublishRequisitionIssuedAsync(requisitionEvent, cancellationToken);
        }

        return MapToDto(order);
    }

    public static ClinicLabOrderDto MapToDto(ClinicLabOrder order) => new(
        order.Id,
        order.TenantId ?? string.Empty,
        order.ClinicId,
        order.OrderNumber,
        order.PatientId,
        order.PatientName,
        order.ConsultationId,
        order.OrderedByDoctorId,
        order.OrderedByDoctorName,
        order.OrderDate,
        order.Status,
        order.ClinicalDiagnosis,
        order.Notes,
        order.Items.Select(i => new ClinicLabOrderItemDto(
            i.Id,
            i.TestName,
            i.Category,
            i.Instructions,
            i.Status
        )).ToList(),
        order.PublicUploadToken,
        !string.IsNullOrEmpty(order.PublicUploadToken) ? $"/api/v1/public/lab-upload/{order.PublicUploadToken}" : null,
        order.ExternalLabName,
        order.ExternalReportUrl,
        order.ExternalReportFileBase64,
        order.ExternalReportType,
        order.UploadedBy,
        order.ObservationsJson,
        order.PathologistImpression,
        order.VerifiedByPathologist,
        order.PathologistPrcLicense,
        order.ReportReleasedAt,
        order.HasCriticalPanicAlert,
        order.CriticalFindingsJson,
        order.PanicAlertTriggeredAt,
        order.PanicAcknowledgedAt,
        order.PanicAcknowledgedBy
    );
}
