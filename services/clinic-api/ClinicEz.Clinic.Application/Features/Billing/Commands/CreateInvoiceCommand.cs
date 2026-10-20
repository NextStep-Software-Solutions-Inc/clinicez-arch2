using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Billing.Commands;

public record CreateInvoiceCommand(
    Guid PatientId,
    string PatientName,
    Guid? QueueItemId = null,
    Guid? AppointmentId = null,
    Guid? ConsultationId = null,
    Guid? AttendingDoctorId = null,
    string? AttendingDoctorName = null,
    DiscountType DiscountType = DiscountType.None,
    string? DiscountIdNumber = null,
    decimal? CustomDiscountPercentage = null,
    string? Notes = null,
    List<CreateInvoiceLineItemRequest>? LineItems = null,
    bool AllowDuplicate = false
) : IRequest<InvoiceDto>;

public class CreateInvoiceCommandHandler : IRequestHandler<CreateInvoiceCommand, InvoiceDto>
{
    private readonly IRepository<Invoice> _invoiceRepo;
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<ConsultationEncounter> _encounterRepo;
    private readonly IRepository<ClinicSettings>? _settingsRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IBillingRequestPublisher _billingPublisher;

    public CreateInvoiceCommandHandler(
        IRepository<Invoice> invoiceRepo,
        IRepository<ClinicPatient> patientRepo,
        IRepository<ConsultationEncounter> encounterRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IBillingRequestPublisher billingPublisher)
        : this(invoiceRepo, patientRepo, encounterRepo, null, unitOfWork, clinicContext, billingPublisher)
    {
    }

    public CreateInvoiceCommandHandler(
        IRepository<Invoice> invoiceRepo,
        IRepository<ClinicPatient> patientRepo,
        IRepository<ConsultationEncounter> encounterRepo,
        IRepository<ClinicSettings>? settingsRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IBillingRequestPublisher billingPublisher)
    {
        _invoiceRepo = invoiceRepo;
        _patientRepo = patientRepo;
        _encounterRepo = encounterRepo;
        _settingsRepo = settingsRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _billingPublisher = billingPublisher;
    }

    public async Task<InvoiceDto> Handle(CreateInvoiceCommand request, CancellationToken cancellationToken)
    {
        if (request.PatientId == Guid.Empty || string.IsNullOrWhiteSpace(request.PatientName))
        {
            throw new BadRequestException("PatientId and PatientName are required to generate an invoice.");
        }

        // Duplicate billing prevention guard
        if (!request.AllowDuplicate)
        {
            if (request.QueueItemId.HasValue)
            {
                var existingQueueInvoice = await _invoiceRepo.Query(i =>
                    i.ClinicId == _clinicContext.ClinicId &&
                    i.QueueItemId == request.QueueItemId.Value &&
                    i.Status != InvoiceStatus.Voided &&
                    i.Status != InvoiceStatus.Refunded)
                    .FirstOrDefaultAsync(cancellationToken);

                if (existingQueueInvoice != null)
                {
                    throw new ConflictException(
                        $"An active invoice ({existingQueueInvoice.InvoiceNumber}) has already been generated for this queue encounter. " +
                        $"Status: {existingQueueInvoice.Status}, Net Amount: ₱{existingQueueInvoice.NetAmount:F2}.");
                }
            }

            if (request.ConsultationId.HasValue)
            {
                var existingConsultationInvoice = await _invoiceRepo.Query(i =>
                    i.ClinicId == _clinicContext.ClinicId &&
                    i.ConsultationId == request.ConsultationId.Value &&
                    i.Status != InvoiceStatus.Voided &&
                    i.Status != InvoiceStatus.Refunded)
                    .FirstOrDefaultAsync(cancellationToken);

                if (existingConsultationInvoice != null)
                {
                    throw new ConflictException(
                        $"An active invoice ({existingConsultationInvoice.InvoiceNumber}) has already been generated for this consultation encounter.");
                }
            }
        }

        var today = DateTime.UtcNow.Date;
        var tomorrow = today.AddDays(1);
        var dateTag = today.ToString("yyyyMMdd");
        var invoicePrefix = $"INV-{dateTag}-";

        // Daily sequential invoice numbering: INV-YYYYMMDD-001
        var existingTodayNumbers = await _invoiceRepo
            .Query(i => (i.InvoiceDate >= today && i.InvoiceDate < tomorrow) || i.InvoiceNumber.StartsWith(invoicePrefix))
            .IgnoreQueryFilters()
            .Where(i => i.ClinicId == _clinicContext.ClinicId)
            .Select(i => i.InvoiceNumber)
            .ToListAsync(cancellationToken);

        var maxSeq = existingTodayNumbers.Count;
        foreach (var num in existingTodayNumbers)
        {
            if (num != null && num.StartsWith(invoicePrefix, StringComparison.OrdinalIgnoreCase))
            {
                var suffix = num.Substring(invoicePrefix.Length);
                if (int.TryParse(suffix, out var parsed) && parsed > maxSeq)
                {
                    maxSeq = parsed;
                }
            }
        }

        var invoiceNumber = $"{invoicePrefix}{(maxSeq + 1):D3}";

        var lineItems = new List<InvoiceLineItem>();
        decimal grossAmount = 0m;

        if (request.LineItems != null && request.LineItems.Any())
        {
            foreach (var item in request.LineItems)
            {
                var qty = Math.Max(1, item.Quantity);
                var unitPrice = Math.Max(0m, item.UnitPrice);
                var totalPrice = Math.Round(unitPrice * qty, 2);

                lineItems.Add(new InvoiceLineItem
                {
                    ServiceItemId = item.ServiceItemId,
                    ItemCode = item.ItemCode,
                    Description = item.Description,
                    Category = item.Category,
                    UnitPrice = unitPrice,
                    Quantity = qty,
                    TotalPrice = totalPrice
                });

                grossAmount += totalPrice;
            }
        }
        else
        {
            // Default consultation line item if no line items explicitly supplied
            var defaultItem = new InvoiceLineItem
            {
                Description = "General Outpatient Medical Consultation",
                Category = "Consultation",
                UnitPrice = 500m,
                Quantity = 1,
                TotalPrice = 500m
            };
            lineItems.Add(defaultItem);
            grossAmount = 500m;
        }

        // Philippine Regulatory Discount Calculation (RA 9994 Senior Citizens / RA 10754 PWD)
        decimal discountPercentage = 0m;
        if (request.DiscountType == DiscountType.SeniorCitizen || request.DiscountType == DiscountType.Pwd)
        {
            discountPercentage = 20.00m;
        }
        else if (request.DiscountType == DiscountType.PhilHealthKonsulta)
        {
            discountPercentage = 100.00m; // Full primary care package coverage
        }
        else if (request.DiscountType == DiscountType.Custom && request.CustomDiscountPercentage.HasValue)
        {
            discountPercentage = Math.Clamp(request.CustomDiscountPercentage.Value, 0m, 100m);
        }

        var discountAmount = Math.Round(grossAmount * (discountPercentage / 100m), 2);
        var netAmount = Math.Max(0m, grossAmount - discountAmount);

        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            InvoiceNumber = invoiceNumber,
            InvoiceDate = DateTime.UtcNow,
            PatientId = request.PatientId,
            PatientName = request.PatientName.Trim(),
            QueueItemId = request.QueueItemId,
            AppointmentId = request.AppointmentId,
            ConsultationId = request.ConsultationId,
            AttendingDoctorId = request.AttendingDoctorId,
            AttendingDoctorName = request.AttendingDoctorName?.Trim(),
            GrossAmount = grossAmount,
            DiscountType = request.DiscountType,
            DiscountIdNumber = request.DiscountIdNumber?.Trim(),
            DiscountPercentage = discountPercentage,
            DiscountAmount = discountAmount,
            NetAmount = netAmount,
            AmountPaid = 0m,
            BalanceDue = netAmount,
            Status = netAmount == 0m ? InvoiceStatus.Paid : InvoiceStatus.Draft,
            Notes = request.Notes?.Trim(),
            BilledByStaffId = _clinicContext.StaffId,
            LineItems = lineItems
        };

        await _invoiceRepo.AddAsync(invoice, cancellationToken);

        var isCashierCounter = _settingsRepo == null;
        if (_settingsRepo != null)
        {
            var mode = await _settingsRepo.Query(s => s.ClinicId == _clinicContext.ClinicId)
                .Select(s => s.CashierMode)
                .FirstOrDefaultAsync(cancellationToken);
            if (!string.IsNullOrEmpty(mode))
            {
                isCashierCounter = string.Equals(mode, "CashierCounter", StringComparison.OrdinalIgnoreCase);
            }
            else
            {
                isCashierCounter = false;
            }
        }

        if (isCashierCounter)
        {
            await PublishInvoiceRequestAsync(invoice, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return MapToDto(invoice);
    }

    /// <summary>
    /// The visit key groups clinic, lab and pharmacy lines into one bill at the shared counter: the consultation id,
    /// else the encounter behind the queue entry, else the queue entry itself.
    /// </summary>
    private async Task PublishInvoiceRequestAsync(Invoice invoice, CancellationToken ct)
    {
        if (invoice.NetAmount <= 0m)
        {
            return;
        }

        var visitKey = invoice.ConsultationId;
        if (visitKey is null && invoice.QueueItemId.HasValue)
        {
            var queueItemId = invoice.QueueItemId.Value;
            var encounterId = await _encounterRepo
                .Query(e => e.ClinicId == _clinicContext.ClinicId && e.QueueItemId == queueItemId)
                .Select(e => (Guid?)e.Id)
                .FirstOrDefaultAsync(ct);
            visitKey = encounterId ?? queueItemId;
        }

        var syncPatientId = await _patientRepo
            .Query(p => p.ClinicId == _clinicContext.ClinicId && p.Id == invoice.PatientId)
            .Select(p => p.SyncPatientId)
            .FirstOrDefaultAsync(ct);

        var lines = invoice.LineItems
            .Select(l => new BillingLineDto
            {
                Code = l.ItemCode ?? string.Empty,
                Description = l.Description,
                Quantity = l.Quantity,
                UnitPrice = l.UnitPrice
            })
            .ToList();

        if (invoice.DiscountAmount > 0m)
        {
            lines.Add(new BillingLineDto
            {
                Code = "DISCOUNT",
                Description = $"Discount ({invoice.DiscountType})",
                Quantity = 1,
                UnitPrice = -invoice.DiscountAmount
            });
        }

        var queued = await _billingPublisher.PublishInvoiceRequestedAsync(new BillingInvoiceRequestedPayload
        {
            InvoiceRequestId = invoice.Id,
            BranchId = _clinicContext.BranchId?.ToString(),
            PatientId = syncPatientId,
            PatientName = invoice.PatientName,
            VisitKey = visitKey?.ToString(),
            SourceType = "Consultation",
            SourceId = invoice.Id,
            Lines = lines
        }, ct);

        if (queued)
        {
            invoice.BillingRequestedAt = DateTime.UtcNow;
        }
    }

    private static InvoiceDto MapToDto(Invoice invoice)
    {
        return new InvoiceDto(
            invoice.Id,
            invoice.TenantId ?? string.Empty,
            invoice.ClinicId,
            invoice.InvoiceNumber,
            invoice.InvoiceDate,
            invoice.PatientId,
            invoice.PatientName,
            invoice.QueueItemId,
            invoice.AppointmentId,
            invoice.ConsultationId,
            invoice.AttendingDoctorId,
            invoice.AttendingDoctorName,
            invoice.GrossAmount,
            invoice.DiscountType,
            invoice.DiscountIdNumber,
            invoice.DiscountPercentage,
            invoice.DiscountAmount,
            invoice.NetAmount,
            invoice.AmountPaid,
            invoice.BalanceDue,
            invoice.Status,
            invoice.Notes,
            invoice.BilledByStaffName,
            invoice.LineItems.Select(l => new InvoiceLineItemDto(
                l.Id,
                l.ServiceItemId,
                l.ItemCode,
                l.Description,
                l.Category,
                l.UnitPrice,
                l.Quantity,
                l.TotalPrice
            )).ToList(),
            invoice.Payments.Select(p => new PaymentRecordDto(
                p.Id,
                p.PaymentNumber,
                p.PaymentDate,
                p.Amount,
                p.Method,
                p.ReferenceNumber,
                p.ReceivedByStaffName,
                p.Notes
            )).ToList()
        );
    }
}
