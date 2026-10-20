using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Billing.Queries;

public record GetInvoicesQuery(
    DateTime? Date = null,
    Guid? PatientId = null,
    InvoiceStatus? Status = null
) : IRequest<List<InvoiceDto>>;

public class GetInvoicesQueryHandler : IRequestHandler<GetInvoicesQuery, List<InvoiceDto>>
{
    private static readonly TimeSpan ManilaOffset = TimeSpan.FromHours(8);
    private readonly IRepository<Invoice> _invoiceRepo;
    private readonly IClinicContext _clinicContext;

    public GetInvoicesQueryHandler(
        IRepository<Invoice> invoiceRepo,
        IClinicContext clinicContext)
    {
        _invoiceRepo = invoiceRepo;
        _clinicContext = clinicContext;
    }

    public async Task<List<InvoiceDto>> Handle(GetInvoicesQuery request, CancellationToken cancellationToken)
    {
        var query = _invoiceRepo.Query()
            .Include(i => i.LineItems)
            .Include(i => i.Payments)
            .AsNoTracking();

        if (request.Date.HasValue)
        {
            var date = DateOnly.FromDateTime(request.Date.Value);
            var dayStartUtc = new DateTimeOffset(date.ToDateTime(TimeOnly.MinValue), ManilaOffset).UtcDateTime;
            var dayEndUtc = new DateTimeOffset(date.AddDays(1).ToDateTime(TimeOnly.MinValue), ManilaOffset).UtcDateTime;
            query = query.Where(i =>
                (i.InvoiceDate >= dayStartUtc && i.InvoiceDate < dayEndUtc) ||
                i.Payments.Any(p => p.PaymentDate >= dayStartUtc && p.PaymentDate < dayEndUtc));
        }

        if (request.PatientId.HasValue)
        {
            query = query.Where(i => i.PatientId == request.PatientId.Value);
        }

        if (request.Status.HasValue)
        {
            query = query.Where(i => i.Status == request.Status.Value);
        }

        var invoices = await query
            .OrderByDescending(i => i.InvoiceDate)
            .ToListAsync(cancellationToken);

        return invoices.Select(invoice => new InvoiceDto(
            invoice.Id,
            invoice.TenantId ?? _clinicContext.TenantId,
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
        )).ToList();
    }
}
