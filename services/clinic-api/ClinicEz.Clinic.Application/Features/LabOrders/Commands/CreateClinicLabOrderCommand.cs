using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common;
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
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IClinicIdentityProvider _clinicIdentity;
    private readonly ILabRequisitionPublisher _requisitionPublisher;

    public CreateClinicLabOrderCommandHandler(
        IRepository<ClinicLabOrder> orderRepo,
        IRepository<ClinicPatient> patientRepo,
        IRepository<StaffMember> staffRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IClinicIdentityProvider clinicIdentity,
        ILabRequisitionPublisher requisitionPublisher)
    {
        _orderRepo = orderRepo;
        _patientRepo = patientRepo;
        _staffRepo = staffRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _clinicIdentity = clinicIdentity;
        _requisitionPublisher = requisitionPublisher;
    }

    public async Task<ClinicLabOrderDto> Handle(CreateClinicLabOrderCommand request, CancellationToken cancellationToken)
    {
        if (request.PatientId == Guid.Empty || string.IsNullOrWhiteSpace(request.PatientName))
        {
            throw new BadRequestException("PatientId and PatientName are required to create a lab order.");
        }

        // A requisition is only sent to a laboratory the clinician chose. Without a target the order stays a
        // patient-carried slip (QR upload token); there is no broadcast.
        var targetFacilityText = request.TargetFacilityId?.Trim();
        var targetTenantId = request.TargetTenantId?.Trim();
        var isRouted = !string.IsNullOrEmpty(targetFacilityText) || !string.IsNullOrEmpty(targetTenantId);
        Guid? targetFacilityId = null;
        if (isRouted)
        {
            if (string.IsNullOrEmpty(targetFacilityText) || string.IsNullOrEmpty(targetTenantId))
            {
                throw new BadRequestException("TargetFacilityId and TargetTenantId must be provided together to route a lab order.");
            }

            if (!Guid.TryParse(targetFacilityText, out var parsedTarget) || parsedTarget == Guid.Empty)
            {
                throw new BadRequestException("TargetFacilityId must be a valid laboratory facility id.");
            }

            targetFacilityId = parsedTarget;
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
            Id = Guid.NewGuid(),
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

        if (isRouted)
        {
            var requisitionEvent = await BuildRequisitionEventAsync(request, order, items, targetFacilityId!.Value, targetTenantId!, cancellationToken);

            // Queued in the interop outbox: it commits in the same SaveChanges as the order, or not at all.
            _requisitionPublisher.PublishRequisitionIssued(requisitionEvent);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return MapToDto(order);
    }

    private async Task<LabRequisitionIssuedEvent> BuildRequisitionEventAsync(
        CreateClinicLabOrderCommand request,
        ClinicLabOrder order,
        List<ClinicLabOrderItem> items,
        Guid targetFacilityId,
        string targetTenantId,
        CancellationToken cancellationToken)
    {
        var clinic = await _clinicIdentity.GetAsync(cancellationToken)
            ?? throw new BadRequestException("This clinic has not been provisioned on this server, so a requisition cannot be issued.");

        var patient = await _patientRepo.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new BadRequestException($"Patient '{request.PatientId}' was not found in this clinic; a routed requisition needs the patient's demographics.");

        if (request.OrderedByDoctorId is not { } doctorId || doctorId == Guid.Empty)
        {
            throw new BadRequestException("OrderedByDoctorId is required to route a lab order to a laboratory.");
        }

        var doctor = await _staffRepo.Query(s => s.Id == doctorId && s.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new BadRequestException($"Ordering doctor '{doctorId}' was not found in this clinic.");

        if (string.IsNullOrWhiteSpace(doctor.PrcLicenseNumber))
        {
            throw new BadRequestException("The ordering doctor has no PRC license number on file; add it to the staff profile before routing a lab order.");
        }

        var doctorName = !string.IsNullOrWhiteSpace(request.OrderedByDoctorName)
            ? request.OrderedByDoctorName.Trim()
            : $"{doctor.Title} {doctor.FirstName} {doctor.LastName}".Trim();

        return new LabRequisitionIssuedEvent
        {
            RequisitionId = order.Id,
            AccessionNumber = order.OrderNumber,
            OrderingFacilityId = clinic.ClinicId.ToString(),
            OrderingFacilityName = clinic.Name,
            TenantId = clinic.TenantId,
            BranchId = _clinicContext.BranchId?.ToString(),
            TargetFacilityId = targetFacilityId.ToString(),
            TargetTenantId = targetTenantId,
            OrderingDoctor = new OrderingDoctorDto
            {
                DoctorId = doctor.Id.ToString(),
                DoctorName = doctorName,
                PrcLicenseNumber = doctor.PrcLicenseNumber.Trim(),
                PtrNumber = doctor.PtrNumber,
                Specialization = doctor.Specialty
            },
            Patient = new RequisitionPatientDto
            {
                PatientId = request.PatientId,
                FullName = request.PatientName.Trim(),
                PhilHealthPin = patient.PhilHealthNumber,
                NationalId = patient.SeniorCitizenId ?? patient.PwdId,
                DateOfBirth = patient.DateOfBirth.ToString("yyyy-MM-dd"),
                Age = PatientAge.InYears(patient.DateOfBirth, DateOnly.FromDateTime(DateTime.UtcNow)),
                Gender = patient.Gender,
                ContactNumber = patient.ContactNumber
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
            PublicUploadToken = order.PublicUploadToken!,
            PublicUploadUrl = $"/api/v1/public/lab-upload/{order.PublicUploadToken}",
            IssuedAt = order.OrderDate
        };
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
