using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Billing.Commands;

public record RecordPaymentCommand(
    Guid InvoiceId,
    decimal Amount,
    PaymentMethod Method,
    string? ReferenceNumber = null,
    string? Notes = null
) : IRequest<InvoiceDto>;

public class RecordPaymentCommandHandler : IRequestHandler<RecordPaymentCommand, InvoiceDto>
{
    private readonly IRepository<Invoice> _invoiceRepo;
    private readonly IRepository<PaymentRecord>? _paymentRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public RecordPaymentCommandHandler(
        IRepository<Invoice> invoiceRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
        : this(invoiceRepo, null, unitOfWork, clinicContext)
    {
    }

    public RecordPaymentCommandHandler(
        IRepository<Invoice> invoiceRepo,
        IRepository<PaymentRecord>? paymentRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _invoiceRepo = invoiceRepo;
        _paymentRepo = paymentRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<InvoiceDto> Handle(RecordPaymentCommand request, CancellationToken cancellationToken)
    {
        if (request.Amount <= 0)
        {
            throw new BadRequestException("Payment amount must be greater than zero.");
        }

        var invoice = await _invoiceRepo.Query(i => i.Id == request.InvoiceId)
            .Include(i => i.LineItems)
            .Include(i => i.Payments)
            .FirstOrDefaultAsync(cancellationToken);

        if (invoice == null)
        {
            throw new NotFoundException($"Invoice with ID '{request.InvoiceId}' not found.");
        }

        if (invoice.Status == InvoiceStatus.Voided)
        {
            throw new BadRequestException("Cannot accept payment for a voided invoice.");
        }

        if (invoice.Status == InvoiceStatus.Refunded)
        {
            throw new BadRequestException("Cannot accept payment for a refunded invoice.");
        }

        // The shared billing counter collects what was requested to it; a local payment would charge the patient twice.
        // Local cashiering stays for charges that were never sent to billing.
        if (invoice.BillingRequestedAt.HasValue)
        {
            throw new PaidAtBillingCounterException(invoice.InvoiceNumber);
        }

        var today = DateTime.UtcNow.Date;
        var tomorrow = today.AddDays(1);
        var dateTag = today.ToString("yyyyMMdd");

        int dailySequence;
        if (_paymentRepo != null)
        {
            dailySequence = await _paymentRepo.Query(p => p.ClinicId == _clinicContext.ClinicId && p.PaymentDate >= today && p.PaymentDate < tomorrow)
                .CountAsync(cancellationToken);
        }
        else
        {
            dailySequence = await _invoiceRepo.Query(i => i.ClinicId == _clinicContext.ClinicId)
                .SelectMany(i => i.Payments)
                .Where(p => p.PaymentDate >= today && p.PaymentDate < tomorrow)
                .CountAsync(cancellationToken);
        }

        var receiptNumber = $"OR-{dateTag}-{(dailySequence + 1):D3}";

        var payment = new PaymentRecord
        {
            InvoiceId = invoice.Id,
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            PaymentNumber = receiptNumber,
            PaymentDate = DateTime.UtcNow,
            Amount = request.Amount,
            Method = request.Method,
            ReferenceNumber = request.ReferenceNumber?.Trim(),
            ReceivedByStaffId = _clinicContext.StaffId,
            ReceivedByStaffName = "Cashier Station",
            Notes = request.Notes?.Trim()
        };

        invoice.Payments.Add(payment);
        invoice.AmountPaid += request.Amount;
        invoice.BalanceDue = Math.Max(0m, invoice.NetAmount - invoice.AmountPaid);

        if (invoice.BalanceDue <= 0m)
        {
            invoice.Status = InvoiceStatus.Paid;
        }
        else
        {
            invoice.Status = InvoiceStatus.PartiallyPaid;
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

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
