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
    private readonly IRepository<LabOrder> _orderRepo;
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IClinicIdentityProvider _clinicIdentity;
    private readonly ILabRequisitionPublisher _requisitionPublisher;
    private readonly IUploadGrantService _uploadGrants;
    private readonly IClaimSlipService _claims;
    private readonly IPatientDocumentPublisher _documents;
    private readonly IRepository<ServiceItem>? _serviceRepo;

    public CreateClinicLabOrderCommandHandler(
        IRepository<LabOrder> orderRepo,
        IRepository<Patient> patientRepo,
        IRepository<StaffMember> staffRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IClinicIdentityProvider clinicIdentity,
        ILabRequisitionPublisher requisitionPublisher,
        IUploadGrantService uploadGrants,
        IClaimSlipService claims,
        IPatientDocumentPublisher documents,
        IRepository<ServiceItem>? serviceRepo = null)
    {
        _orderRepo = orderRepo;
        _patientRepo = patientRepo;
        _staffRepo = staffRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _clinicIdentity = clinicIdentity;
        _requisitionPublisher = requisitionPublisher;
        _uploadGrants = uploadGrants;
        _claims = claims;
        _documents = documents;
        _serviceRepo = serviceRepo;
    }

    public async Task<ClinicLabOrderDto> Handle(CreateClinicLabOrderCommand request, CancellationToken cancellationToken)
    {
        if (request.PatientId == Guid.Empty || string.IsNullOrWhiteSpace(request.PatientName))
        {
            throw new BadRequestException("PatientId and PatientName are required to create a lab order.");
        }

        // A routed requisition goes to the laboratory the clinician chose. Without a target the order is a
        // patient-carried slip: it gets a hub claim (QR) that any ClinicEZ laboratory can redeem.
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

        bool isDoctorOrder = false;
        if (request.OrderedByDoctorId is { } doctorId && doctorId != Guid.Empty)
        {
            var doctor = await _staffRepo.Query(s => s.Id == doctorId && s.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);
            if (doctor != null && !string.IsNullOrWhiteSpace(doctor.PrcLicenseNumber))
            {
                isDoctorOrder = true;
            }
        }

        if (!isRouted && !isDoctorOrder && _serviceRepo != null)
        {
            var testNames = request.Items != null && request.Items.Any()
                ? request.Items.Select(i => i.TestName.Trim()).ToList()
                : new List<string> { "Complete Blood Count (CBC) with Platelet" };

            foreach (var testName in testNames)
            {
                var testUpper = testName.ToUpperInvariant();
                var serviceItem = await _serviceRepo.Query(s => s.ClinicId == _clinicContext.ClinicId &&
                    (s.Code.ToUpper() == testUpper || s.Name.ToUpper() == testUpper))
                    .FirstOrDefaultAsync(cancellationToken);

                if (serviceItem == null || !serviceItem.IsNurseOrderable)
                {
                    throw new BadRequestException($"Only laboratory tests flagged as nurse-orderable in the clinic catalog can be ordered by non-doctor staff. Doctor order required for '{testName}'.");
                }
            }
        }

        var today = DateTime.UtcNow.Date;
        var tomorrow = today.AddDays(1);
        var todayCount = await _orderRepo.Query(o => o.OrderDate >= today && o.OrderDate < tomorrow)
            .CountAsync(cancellationToken);

        var dateTag = today.ToString("yyyyMMdd");
        var orderNumber = $"LAB-{dateTag}-{(todayCount + 1):D3}";

        var items = new List<LabOrderItem>();
        if (request.Items != null && request.Items.Any())
        {
            foreach (var item in request.Items)
            {
                items.Add(new LabOrderItem
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
            items.Add(new LabOrderItem
            {
                TestName = "Complete Blood Count (CBC) with Platelet",
                Category = "Hematology",
                Instructions = "Standard EDTA whole blood tube",
                Status = LabOrderStatus.Ordered
            });
        }

        var order = new LabOrder
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
            Stage = isRouted ? LabOrderStage.Routed : LabOrderStage.Issued,
            StageChangedAt = DateTime.UtcNow,
            TargetTenantId = targetTenantId,
            TargetFacilityId = targetFacilityId,
            ClinicalDiagnosis = request.ClinicalDiagnosis?.Trim(),
            Notes = request.Notes?.Trim(),
            Items = items
        };

        // The one-time upload link for an external lab; only its hash is stored. Fails fast when the public URL is not configured.
        var upload = await _uploadGrants.MintAsync(order, UploaderKind.ExternalLab, cancellationToken);

        await _orderRepo.AddAsync(order, cancellationToken);

        var requisition = await BuildRequisitionEventAsync(
            request, order, items, targetFacilityId, targetTenantId, upload, isRouted, cancellationToken);

        // Everything below is queued in the interop outbox: it commits in the same SaveChanges as the order, or not at all.
        if (requisition != null)
        {
            if (isRouted)
            {
                _requisitionPublisher.PublishRequisitionIssued(requisition);
            }
            else
            {
                var claim = await _claims.CreateLabClaimAsync(requisition, cancellationToken);
                order.ClaimToken = claim.Token;
                order.ClaimExpiresAt = claim.ExpiresAtUtc;
            }

            await _documents.PublishAsync(new PatientDocumentDraft(
                order.ClinicId,
                order.PatientId,
                order.Id,
                PatientDocumentKind.LabRequest,
                $"Laboratory request {order.OrderNumber}",
                order.OrderDate,
                Status: order.Stage.ToString(),
                ClaimToken: order.ClaimToken,
                Body: requisition), cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return MapToDto(order, results: null, upload.Url);
    }

    /// <summary>
    /// A routed requisition must be fully formed or the request is rejected. A patient-carried slip only becomes claimable
    /// when the clinic is provisioned and the patient and the ordering doctor's PRC license are on file; otherwise it stays
    /// a local paper slip without a claim.
    /// </summary>
    private async Task<LabRequisitionIssuedEvent?> BuildRequisitionEventAsync(
        CreateClinicLabOrderCommand request,
        LabOrder order,
        List<LabOrderItem> items,
        Guid? targetFacilityId,
        string? targetTenantId,
        MintedUploadGrant upload,
        bool isRouted,
        CancellationToken cancellationToken)
    {
        var clinic = await _clinicIdentity.GetAsync(cancellationToken);
        if (clinic == null)
        {
            return isRouted
                ? throw new BadRequestException("This clinic has not been provisioned on this server, so a requisition cannot be issued.")
                : null;
        }

        var patient = await _patientRepo.GetByIdAsync(request.PatientId, cancellationToken);
        if (patient == null && isRouted)
        {
            throw new BadRequestException($"Patient '{request.PatientId}' was not found in this clinic; a routed requisition needs the patient's demographics.");
        }

        StaffMember? doctor = null;
        if (request.OrderedByDoctorId is { } doctorId && doctorId != Guid.Empty)
        {
            doctor = await _staffRepo.Query(s => s.Id == doctorId && s.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);
        }

        if (isRouted)
        {
            if (request.OrderedByDoctorId is not { } routedDoctorId || routedDoctorId == Guid.Empty)
            {
                throw new BadRequestException("OrderedByDoctorId is required to route a lab order to a laboratory.");
            }

            if (doctor == null)
            {
                throw new BadRequestException($"Ordering doctor '{routedDoctorId}' was not found in this clinic.");
            }

            if (string.IsNullOrWhiteSpace(doctor.PrcLicenseNumber))
            {
                throw new BadRequestException("The ordering doctor has no PRC license number on file; add it to the staff profile before routing a lab order.");
            }
        }

        if (patient == null || doctor == null || string.IsNullOrWhiteSpace(doctor.PrcLicenseNumber))
        {
            return null;
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
            VisitKey = request.ConsultationId?.ToString(),
            TargetFacilityId = targetFacilityId?.ToString(),
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
                PatientId = patient.CloudPatientId ?? Guid.Empty,
                FullName = request.PatientName.Trim(),
                PhilHealthPin = patient.PhilHealthNumber,
                NationalId = patient.SeniorCitizenId ?? patient.PwdId,
                DateOfBirth = patient.DateOfBirth.ToString("yyyy-MM-dd"),
                Age = PatientAge.InYears(patient.DateOfBirth, DateOnly.FromDateTime(DateTime.UtcNow)),
                Gender = patient.Sex.ToString(),
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
            PublicUploadToken = upload.Token,
            PublicUploadUrl = upload.Url,
            IssuedAt = order.OrderDate
        };
    }

    /// <param name="results">The order's results, when loaded; null renders as none.</param>
    /// <param name="publicUploadUrl">The one-time upload link, only known at the moment a grant is minted.</param>
    public static ClinicLabOrderDto MapToDto(
        LabOrder order,
        IEnumerable<LabResult>? results = null,
        string? publicUploadUrl = null) => new(
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
            i.Status,
            i.LoincCode,
            i.IsPhysicianRecommended,
            i.PatientComplianceCode,
            i.DiagnosticFee
        )).ToList(),
        publicUploadUrl,
        order.ExternalLabName,
        order.ExternalReportUrl,
        order.UploadedBy,
        order.PathologistImpression,
        order.VerifiedByPathologist,
        order.PathologistPrcLicense,
        order.ReportReleasedAt,
        order.HasCriticalPanicAlert,
        order.PanicAlertTriggeredAt,
        order.PanicAcknowledgedAt,
        order.PanicAcknowledgedBy,
        order.Stage,
        order.StageReason,
        order.QuotedAmount,
        order.QuotedCurrency,
        order.PaymentRequired,
        order.LaboratoryName,
        order.ClaimToken,
        (results ?? Enumerable.Empty<LabResult>())
            .Select(r => new ClinicLabResultSummaryDto(r.Id, r.Source, r.Verification))
            .ToList(),
        order.Observations?.Select(o => new LabObservationDto(
            o.Id,
            o.LabOrderId,
            o.LabOrderItemId,
            o.LoincCode,
            o.AnalyteCode,
            o.AnalyteName,
            o.ValueText,
            o.NumericValue,
            o.Unit,
            o.ReferenceRangeLow,
            o.ReferenceRangeHigh,
            o.AbnormalFlag,
            o.IsCriticalPanic
        )).ToList()
    );
}
