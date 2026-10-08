using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
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
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public CreateInvoiceCommandHandler(
        IRepository<Invoice> invoiceRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _invoiceRepo = invoiceRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
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
                    i.Status != InvoiceStatus.Voided)
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
                    i.Status != InvoiceStatus.Voided)
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

        // Daily sequential invoice numbering: INV-YYYYMMDD-001
        var todayCount = await _invoiceRepo.Query(i => i.InvoiceDate >= today && i.InvoiceDate < tomorrow)
            .CountAsync(cancellationToken);

        var dateTag = today.ToString("yyyyMMdd");
        var invoiceNumber = $"INV-{dateTag}-{(todayCount + 1):D3}";

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
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return MapToDto(invoice);
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
