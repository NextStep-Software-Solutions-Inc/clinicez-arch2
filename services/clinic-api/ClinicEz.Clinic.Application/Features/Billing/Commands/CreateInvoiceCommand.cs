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
using System.Text.Json.Serialization;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Billing.Commands;

[method: JsonConstructor]
public record CreateInvoiceCommand(
    Guid? PatientId = null,
    string? PatientName = null,
    Guid? QueueItemId = null,
    Guid? AppointmentId = null,
    Guid? ConsultationId = null,
    Guid? AttendingDoctorId = null,
    DiscountType DiscountType = DiscountType.None,
    string? DiscountIdNumber = null,
    decimal? CustomDiscountPercentage = null,
    string? Notes = null,
    List<CreateInvoiceLineItemRequest>? LineItems = null,
    bool AllowDuplicate = false,
    bool IsWalkInRetail = false,
    string? WalkInCustomerName = null,
    VisitType? VisitType = null
) : IRequest<InvoiceDto>
{
    public CreateInvoiceCommand(
        Guid patientId,
        string patientName,
        Guid? queueItemId = null,
        Guid? appointmentId = null,
        Guid? consultationId = null,
        Guid? attendingDoctorId = null,
        DiscountType discountType = DiscountType.None,
        string? discountIdNumber = null,
        decimal? customDiscountPercentage = null,
        string? notes = null,
        List<CreateInvoiceLineItemRequest>? lineItems = null,
        bool allowDuplicate = false)
        : this(
            patientId,
            patientName,
            queueItemId,
            appointmentId,
            consultationId,
            attendingDoctorId,
            discountType,
            discountIdNumber,
            customDiscountPercentage,
            notes,
            lineItems,
            allowDuplicate,
            false,
            null,
            null)
    {
    }
};

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
        if (!request.IsWalkInRetail && (!request.PatientId.HasValue || request.PatientId.Value == Guid.Empty || string.IsNullOrWhiteSpace(request.PatientName)))
        {
            throw new BadRequestException("PatientId and PatientName are required to generate an invoice.");
        }

        var effectivePatientId = request.PatientId.HasValue && request.PatientId.Value != Guid.Empty
            ? request.PatientId.Value
            : Guid.Empty;

        var effectivePatientName = !string.IsNullOrWhiteSpace(request.WalkInCustomerName)
            ? request.WalkInCustomerName.Trim()
            : (!string.IsNullOrWhiteSpace(request.PatientName) ? request.PatientName.Trim() : "Walk-In Retail Guest");

        // Active invoice lookup for Draft SOA merging & Paid duplicate prevention
        Invoice? existingInvoice = null;
        if (request.QueueItemId.HasValue || request.ConsultationId.HasValue)
        {
            var qId = request.QueueItemId;
            var cId = request.ConsultationId;
            existingInvoice = await _invoiceRepo.Query(i =>
                i.ClinicId == _clinicContext.ClinicId &&
                i.Status != InvoiceStatus.Voided &&
                i.Status != InvoiceStatus.Refunded &&
                ((qId.HasValue && i.QueueItemId == qId.Value) ||
                 (cId.HasValue && i.ConsultationId == cId.Value)))
                .Include(i => i.LineItems)
                .Include(i => i.Payments)
                .FirstOrDefaultAsync(cancellationToken);
        }

        if (existingInvoice != null)
        {
            if (existingInvoice.Status == InvoiceStatus.Paid)
            {
                if (!request.AllowDuplicate)
                {
                    throw new ConflictException(
                        $"An active invoice ({existingInvoice.InvoiceNumber}) has already been generated and paid for this encounter. Duplicate billing blocked.");
                }
                // When AllowDuplicate is true, proceed to generate a separate invoice
            }
            else // Draft or PartiallyPaid: MERGE incoming charges into existing draft SOA
            {
                var incomingItems = request.LineItems ?? new List<CreateInvoiceLineItemRequest>();

                foreach (var item in incomingItems)
                {
                    var qty = Math.Max(1, item.Quantity);
                    var unitPrice = Math.Max(0m, item.UnitPrice);
                    var targetDoctorId = item.DoctorId ?? request.AttendingDoctorId;
                    var targetDoctorName = item.DoctorName;

                    // Consolidate identical items (same price, doctor, and item code/description)
                    var existingItem = existingInvoice.LineItems.FirstOrDefault(li =>
                        li.UnitPrice == unitPrice &&
                        li.DoctorId == targetDoctorId &&
                        ((!string.IsNullOrEmpty(item.ItemCode) && string.Equals(li.ItemCode, item.ItemCode, StringComparison.OrdinalIgnoreCase)) ||
                         (string.IsNullOrEmpty(item.ItemCode) && string.Equals(li.Description, item.Description, StringComparison.OrdinalIgnoreCase)))
                    );

                    if (existingItem != null)
                    {
                        existingItem.Quantity += qty;
                        existingItem.TotalPrice = Math.Round(existingItem.UnitPrice * existingItem.Quantity, 2);
                        if (string.IsNullOrWhiteSpace(existingItem.DoctorName) && !string.IsNullOrWhiteSpace(targetDoctorName))
                        {
                            existingItem.DoctorName = targetDoctorName;
                        }
                    }
                    else
                    {
                        var totalPrice = Math.Round(unitPrice * qty, 2);
                        existingInvoice.LineItems.Add(new InvoiceLineItem
                        {
                            Id = Guid.Empty,
                            InvoiceId = existingInvoice.Id,
                            DoctorId = targetDoctorId,
                            DoctorName = targetDoctorName,
                            ServiceItemId = item.ServiceItemId,
                            ItemCode = item.ItemCode,
                            Description = item.Description,
                            Category = item.Category,
                            UnitPrice = unitPrice,
                            Quantity = qty,
                            TotalPrice = totalPrice
                        });
                    }
                }

                if (!existingInvoice.ConsultationId.HasValue && request.ConsultationId.HasValue)
                {
                    existingInvoice.ConsultationId = request.ConsultationId;
                }
                if (!existingInvoice.QueueItemId.HasValue && request.QueueItemId.HasValue)
                {
                    existingInvoice.QueueItemId = request.QueueItemId;
                }
                if (!existingInvoice.AppointmentId.HasValue && request.AppointmentId.HasValue)
                {
                    existingInvoice.AppointmentId = request.AppointmentId;
                }

                var grossAmount = existingInvoice.LineItems.Sum(li => li.TotalPrice);
                existingInvoice.GrossAmount = grossAmount;

                var discountType = request.DiscountType != DiscountType.None ? request.DiscountType : existingInvoice.DiscountType;
                var discountIdNumber = !string.IsNullOrWhiteSpace(request.DiscountIdNumber) ? request.DiscountIdNumber.Trim() : existingInvoice.DiscountIdNumber;
                var customPct = request.CustomDiscountPercentage ?? (existingInvoice.DiscountPercentage > 0 ? existingInvoice.DiscountPercentage : (decimal?)null);

                decimal discountPercentage = 0m;
                decimal discountAmount = 0m;
                if (discountType == DiscountType.SeniorCitizen || discountType == DiscountType.Pwd)
                {
                    discountPercentage = 20.00m;
                    discountAmount = Math.Round(grossAmount * (discountPercentage / 100m), 2);
                }
                else if (discountType == DiscountType.PhilHealthKonsulta)
                {
                    discountPercentage = 100.00m;
                    if (request.DiscountType == DiscountType.None && existingInvoice.DiscountAmount > 0m)
                    {
                        discountAmount = existingInvoice.DiscountAmount;
                        if (grossAmount > 0m && discountAmount < grossAmount)
                        {
                            discountPercentage = Math.Round((discountAmount / grossAmount) * 100m, 2);
                        }
                    }
                    else
                    {
                        discountAmount = grossAmount;
                    }
                }
                else if (discountType == DiscountType.Custom && customPct.HasValue)
                {
                    discountPercentage = Math.Clamp(customPct.Value, 0m, 100m);
                    discountAmount = Math.Round(grossAmount * (discountPercentage / 100m), 2);
                }

                var netAmount = Math.Max(0m, grossAmount - discountAmount);

                existingInvoice.DiscountType = discountType;
                existingInvoice.DiscountIdNumber = discountIdNumber;
                existingInvoice.DiscountPercentage = discountPercentage;
                existingInvoice.DiscountAmount = discountAmount;
                existingInvoice.NetAmount = netAmount;
                existingInvoice.BalanceDue = Math.Max(0m, netAmount - existingInvoice.AmountPaid);

                if (existingInvoice.BalanceDue <= 0m && existingInvoice.AmountPaid > 0m)
                {
                    existingInvoice.Status = InvoiceStatus.Paid;
                }
                else if (existingInvoice.AmountPaid >= netAmount && netAmount > 0m)
                {
                    existingInvoice.Status = InvoiceStatus.Paid;
                }
                else if (existingInvoice.AmountPaid > 0m)
                {
                    existingInvoice.Status = InvoiceStatus.PartiallyPaid;
                }
                else
                {
                    existingInvoice.Status = InvoiceStatus.Draft;
                }

                if (!string.IsNullOrWhiteSpace(request.Notes))
                {
                    existingInvoice.Notes = string.IsNullOrWhiteSpace(existingInvoice.Notes)
                        ? request.Notes.Trim()
                        : $"{existingInvoice.Notes}; {request.Notes.Trim()}";
                }

                var isCashierCounterMerge = _settingsRepo == null;
                if (_settingsRepo != null)
                {
                    var mode = await _settingsRepo.Query(s => s.ClinicId == _clinicContext.ClinicId)
                        .Select(s => s.CashierMode)
                        .FirstOrDefaultAsync(cancellationToken);
                    if (!string.IsNullOrEmpty(mode))
                    {
                        isCashierCounterMerge = string.Equals(mode, "CashierCounter", StringComparison.OrdinalIgnoreCase);
                    }
                    else
                    {
                        isCashierCounterMerge = false;
                    }
                }

                if (isCashierCounterMerge && existingInvoice.PatientId != Guid.Empty && !request.IsWalkInRetail)
                {
                    await PublishInvoiceRequestAsync(existingInvoice, cancellationToken);
                }

                await _unitOfWork.SaveChangesAsync(cancellationToken);

                return MapToDto(existingInvoice);
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
        decimal grossAmountNew = 0m;

        if (request.LineItems != null && request.LineItems.Any())
        {
            foreach (var item in request.LineItems)
            {
                var qty = Math.Max(1, item.Quantity);
                var unitPrice = Math.Max(0m, item.UnitPrice);
                var targetDoctorId = item.DoctorId ?? request.AttendingDoctorId;
                var targetDoctorName = item.DoctorName;

                var existing = lineItems.FirstOrDefault(li =>
                    li.UnitPrice == unitPrice &&
                    li.DoctorId == targetDoctorId &&
                    ((!string.IsNullOrEmpty(item.ItemCode) && string.Equals(li.ItemCode, item.ItemCode, StringComparison.OrdinalIgnoreCase)) ||
                     (string.IsNullOrEmpty(item.ItemCode) && string.Equals(li.Description, item.Description, StringComparison.OrdinalIgnoreCase)))
                );

                if (existing != null)
                {
                    existing.Quantity += qty;
                    existing.TotalPrice = Math.Round(existing.UnitPrice * existing.Quantity, 2);
                    if (string.IsNullOrWhiteSpace(existing.DoctorName) && !string.IsNullOrWhiteSpace(targetDoctorName))
                    {
                        existing.DoctorName = targetDoctorName;
                    }
                }
                else
                {
                    var totalPrice = Math.Round(unitPrice * qty, 2);
                    lineItems.Add(new InvoiceLineItem
                    {
                        DoctorId = targetDoctorId,
                        DoctorName = targetDoctorName,
                        ServiceItemId = item.ServiceItemId,
                        ItemCode = item.ItemCode,
                        Description = item.Description,
                        Category = item.Category,
                        UnitPrice = unitPrice,
                        Quantity = qty,
                        TotalPrice = totalPrice
                    });
                }
            }
            grossAmountNew = lineItems.Sum(li => li.TotalPrice);
        }
        else
        {
            // Default consultation line item if no line items explicitly supplied
            var defaultItem = new InvoiceLineItem
            {
                DoctorId = request.AttendingDoctorId,
                DoctorName = null,
                Description = "General Outpatient Medical Consultation",
                Category = "Consultation",
                UnitPrice = 500m,
                Quantity = 1,
                TotalPrice = 500m
            };
            lineItems.Add(defaultItem);
            grossAmountNew = 500m;
        }

        // Philippine Regulatory Discount Calculation (RA 9994 Senior Citizens / RA 10754 PWD)
        decimal discountPercentageNew = 0m;
        decimal discountAmountNew = 0m;
        if (request.DiscountType == DiscountType.SeniorCitizen || request.DiscountType == DiscountType.Pwd)
        {
            if (string.IsNullOrWhiteSpace(request.DiscountIdNumber))
            {
                throw new BadRequestException("Discount ID number is required for Senior Citizen and PWD discounts.");
            }
            if (request.DiscountIdNumber.Trim().Length < 3)
            {
                throw new BadRequestException("Invalid Senior Citizen / PWD ID number format.");
            }
            discountPercentageNew = 20.00m;
            discountAmountNew = Math.Round(grossAmountNew * (discountPercentageNew / 100m), 2);
        }
        else if (request.DiscountType == DiscountType.PhilHealthKonsulta)
        {
            discountPercentageNew = 100.00m; // Full primary care package coverage
            discountAmountNew = grossAmountNew;
        }
        else if (request.DiscountType == DiscountType.Custom && request.CustomDiscountPercentage.HasValue)
        {
            discountPercentageNew = Math.Clamp(request.CustomDiscountPercentage.Value, 0m, 100m);
            discountAmountNew = Math.Round(grossAmountNew * (discountPercentageNew / 100m), 2);
        }

        var netAmountNew = Math.Max(0m, grossAmountNew - discountAmountNew);

        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            InvoiceNumber = invoiceNumber,
            InvoiceDate = DateTime.UtcNow,
            PatientId = effectivePatientId,
            PatientName = effectivePatientName,
            QueueItemId = request.QueueItemId,
            AppointmentId = request.AppointmentId,
            ConsultationId = request.ConsultationId,
            AttendingDoctorId = request.AttendingDoctorId,
            GrossAmount = grossAmountNew,
            DiscountType = request.DiscountType,
            DiscountIdNumber = request.DiscountIdNumber?.Trim(),
            DiscountPercentage = discountPercentageNew,
            DiscountAmount = discountAmountNew,
            NetAmount = netAmountNew,
            AmountPaid = 0m,
            BalanceDue = netAmountNew,
            Status = InvoiceStatus.Draft,
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

        var shouldForwardToCashierCounter = isCashierCounter &&
            invoice.PatientId != Guid.Empty &&
            !request.IsWalkInRetail;

        if (shouldForwardToCashierCounter)
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
        if (invoice.PatientId == Guid.Empty || invoice.NetAmount <= 0m)
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
                l.DoctorId,
                l.DoctorName,
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
