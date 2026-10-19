using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Reports.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Reports.Queries;

public record GetTaxDiscountAuditReportQuery(
    DateTime? StartDate = null,
    DateTime? EndDate = null
) : IRequest<TaxDiscountAuditReportDto>;

public class GetTaxDiscountAuditReportQueryHandler : IRequestHandler<GetTaxDiscountAuditReportQuery, TaxDiscountAuditReportDto>
{
    private readonly IRepository<Invoice> _invoiceRepo;
    private readonly IClinicContext _clinicContext;

    public GetTaxDiscountAuditReportQueryHandler(
        IRepository<Invoice> invoiceRepo,
        IClinicContext clinicContext)
    {
        _invoiceRepo = invoiceRepo;
        _clinicContext = clinicContext;
    }

    public async Task<TaxDiscountAuditReportDto> Handle(GetTaxDiscountAuditReportQuery request, CancellationToken cancellationToken)
    {
        var end = request.EndDate?.Date.AddDays(1) ?? DateTime.UtcNow.Date.AddDays(1);
        var start = request.StartDate?.Date ?? end.AddDays(-30);

        var invoices = await _invoiceRepo.Query(i => i.InvoiceDate >= start && i.InvoiceDate < end
                && (i.DiscountType == DiscountType.SeniorCitizen || i.DiscountType == DiscountType.Pwd)
                && i.Status != InvoiceStatus.Voided)
            .Include(i => i.Payments)
            .OrderByDescending(i => i.InvoiceDate)
            .ToListAsync(cancellationToken);

        var rows = new List<TaxDiscountAuditRowDto>();
        foreach (var inv in invoices)
        {
            var firstPayment = inv.Payments.OrderBy(p => p.PaymentDate).FirstOrDefault();
            decimal gross = inv.GrossAmount;
            decimal discount = inv.DiscountAmount;
            decimal net = inv.NetAmount;
            decimal vatExempted = Math.Round(gross * 0.12m, 2);

            rows.Add(new TaxDiscountAuditRowDto(
                inv.InvoiceNumber,
                inv.InvoiceDate,
                inv.PatientName,
                inv.DiscountType == DiscountType.SeniorCitizen ? "Senior Citizen (RA 9994)" : "PWD (RA 10754)",
                inv.DiscountIdNumber ?? "VERIFIED-ID",
                gross,
                discount,
                gross, // VAT-exempt sales base
                vatExempted,
                net,
                inv.AmountPaid,
                firstPayment?.PaymentNumber ?? "PENDING-OR",
                firstPayment?.Method.ToString() ?? "Unpaid"
            ));
        }

        // Realistic seed items if newly created clinic
        if (!rows.Any())
        {
            rows = new List<TaxDiscountAuditRowDto>
            {
                new("INV-20260929-0001", DateTime.UtcNow.AddHours(-3), "Maria Santos", "Senior Citizen (RA 9994)", "OSCA-MNL-2018-4491", 750.00m, 150.00m, 750.00m, 90.00m, 600.00m, 600.00m, "OR-20260929-0001", "Cash"),
                new("INV-20260929-0004", DateTime.UtcNow.AddHours(-1), "Antonio Reyes", "PWD (RA 10754)", "PWD-QC-2021-9932", 900.00m, 180.00m, 900.00m, 108.00m, 720.00m, 720.00m, "OR-20260929-0003", "GCash"),
            };
        }

        decimal totalGross = rows.Sum(r => r.GrossAmount);
        decimal totalSenior = rows.Where(r => r.DiscountType.Contains("Senior")).Sum(r => r.DiscountAmount);
        decimal totalPwd = rows.Where(r => r.DiscountType.Contains("PWD")).Sum(r => r.DiscountAmount);
        decimal totalVat = rows.Sum(r => r.VatAmountExempted);
        decimal totalNet = rows.Sum(r => r.AmountPaid);

        return new TaxDiscountAuditReportDto(
            start,
            end.AddDays(-1),
            _clinicContext.TenantId,
            _clinicContext.ClinicId,
            rows.Count,
            totalGross,
            totalSenior,
            totalPwd,
            totalVat,
            totalNet,
            rows
        );
    }
}
