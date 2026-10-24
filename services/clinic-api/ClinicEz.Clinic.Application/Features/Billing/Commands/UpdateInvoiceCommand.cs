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

public record UpdateInvoiceCommand(
    Guid InvoiceId,
    DiscountType? DiscountType = null,
    string? DiscountIdNumber = null,
    decimal? CustomDiscountPercentage = null,
    string? Notes = null,
    List<CreateInvoiceLineItemRequest>? LineItems = null
) : IRequest<InvoiceDto>;

public record UpdateInvoiceRequest(
    DiscountType? DiscountType = null,
    string? DiscountIdNumber = null,
    decimal? CustomDiscountPercentage = null,
    string? Notes = null,
    List<CreateInvoiceLineItemRequest>? LineItems = null
);

public class UpdateInvoiceCommandHandler : IRequestHandler<UpdateInvoiceCommand, InvoiceDto>
{
    private readonly IRepository<Invoice> _invoiceRepo;
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<ConsultationEncounter> _encounterRepo;
    private readonly IRepository<ClinicSettings>? _settingsRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IBillingRequestPublisher _billingPublisher;

    public UpdateInvoiceCommandHandler(
        IRepository<Invoice> invoiceRepo,
        IRepository<ClinicPatient> patientRepo,
        IRepository<ConsultationEncounter> encounterRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IBillingRequestPublisher billingPublisher)
        : this(invoiceRepo, patientRepo, encounterRepo, null, unitOfWork, clinicContext, billingPublisher)
    {
    }

    public UpdateInvoiceCommandHandler(
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

    public async Task<InvoiceDto> Handle(UpdateInvoiceCommand request, CancellationToken ct)
    {
        var invoice = await _invoiceRepo.Query(i => i.Id == request.InvoiceId && i.ClinicId == _clinicContext.ClinicId)
            .Include(i => i.LineItems)
            .Include(i => i.Payments)
            .FirstOrDefaultAsync(ct);

        if (invoice == null)
        {
            throw new NotFoundException($"Invoice with ID '{request.InvoiceId}' not found.");
        }

        if (invoice.Status != InvoiceStatus.Draft && invoice.Status != InvoiceStatus.PartiallyPaid)
        {
            throw new BadRequestException($"Cannot update invoice with status '{invoice.Status}'. Only draft or partially paid invoices can be modified.");
        }

        if (request.LineItems != null && request.LineItems.Any())
        {
            invoice.LineItems.Clear();
            foreach (var item in request.LineItems)
            {
                var qty = Math.Max(1, item.Quantity);
                var unitPrice = Math.Max(0m, item.UnitPrice);
                var targetDoctorId = item.DoctorId;
                var targetDoctorName = item.DoctorName;

                var existing = invoice.LineItems.FirstOrDefault(li =>
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
                    invoice.LineItems.Add(new InvoiceLineItem
                    {
                        Id = Guid.Empty,
                        InvoiceId = invoice.Id,
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
            invoice.GrossAmount = invoice.LineItems.Sum(li => li.TotalPrice);
        }

        if (request.DiscountType.HasValue)
        {
            invoice.DiscountType = request.DiscountType.Value;
            invoice.DiscountIdNumber = request.DiscountIdNumber?.Trim();

            decimal discountPercentage = 0m;
            decimal discountAmount = 0m;
            if (invoice.DiscountType == DiscountType.SeniorCitizen || invoice.DiscountType == DiscountType.Pwd)
            {
                discountPercentage = 20.00m;
                discountAmount = Math.Round(invoice.GrossAmount * (discountPercentage / 100m), 2);
            }
            else if (invoice.DiscountType == DiscountType.PhilHealthKonsulta)
            {
                discountPercentage = 100.00m;
                discountAmount = invoice.LineItems
                    .Where(li => string.Equals(li.Category, "Consultation", StringComparison.OrdinalIgnoreCase) ||
                                 (li.ItemCode != null && li.ItemCode.StartsWith("KONSULTA", StringComparison.OrdinalIgnoreCase)))
                    .Sum(li => li.TotalPrice);
            }
            else if (invoice.DiscountType == DiscountType.Custom && request.CustomDiscountPercentage.HasValue)
            {
                discountPercentage = Math.Clamp(request.CustomDiscountPercentage.Value, 0m, 100m);
                discountAmount = Math.Round(invoice.GrossAmount * (discountPercentage / 100m), 2);
            }

            invoice.DiscountPercentage = discountPercentage;
            invoice.DiscountAmount = discountAmount;
        }

        invoice.NetAmount = Math.Max(0m, invoice.GrossAmount - invoice.DiscountAmount);
        invoice.BalanceDue = Math.Max(0m, invoice.NetAmount - invoice.AmountPaid);
        if (invoice.BalanceDue <= 0m && invoice.NetAmount == 0m)
        {
            invoice.Status = InvoiceStatus.Paid;
        }

        if (request.Notes != null)
        {
            invoice.Notes = request.Notes.Trim();
        }

        invoice.UpdatedAt = DateTime.UtcNow;

        var isCashierCounter = false;
        if (_settingsRepo != null)
        {
            var mode = await _settingsRepo.Query(s => s.ClinicId == _clinicContext.ClinicId)
                .Select(s => s.CashierMode)
                .FirstOrDefaultAsync(ct);
            isCashierCounter = string.Equals(mode, "CashierCounter", StringComparison.OrdinalIgnoreCase);
        }

        if ((isCashierCounter || invoice.BillingRequestedAt.HasValue) && invoice.PatientId != Guid.Empty)
        {
            await RePublishInvoiceRequestAsync(invoice, ct);
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return MapToDto(invoice);
    }

    private async Task RePublishInvoiceRequestAsync(Invoice invoice, CancellationToken ct)
    {
        if (invoice.PatientId == Guid.Empty || (invoice.NetAmount <= 0m && !invoice.BillingRequestedAt.HasValue)) return;

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
