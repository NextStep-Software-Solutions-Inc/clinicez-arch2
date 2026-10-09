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

public record GetDailyEodReportQuery(DateTime? Date = null) : IRequest<DailyEodReportDto>;

public class GetDailyEodReportQueryHandler : IRequestHandler<GetDailyEodReportQuery, DailyEodReportDto>
{
    private readonly IRepository<QueueItem> _queueRepo;
    private readonly IRepository<Invoice> _invoiceRepo;
    private readonly IRepository<PaymentRecord> _paymentRepo;
    private readonly IRepository<ConsultationEncounter> _consultationRepo;
    private readonly IRepository<ClinicalProcedure> _procedureRepo;
    private readonly IRepository<ClinicLabOrder> _labOrderRepo;
    private readonly IClinicContext _clinicContext;

    public GetDailyEodReportQueryHandler(
        IRepository<QueueItem> queueRepo,
        IRepository<Invoice> invoiceRepo,
        IRepository<PaymentRecord> paymentRepo,
        IRepository<ConsultationEncounter> consultationRepo,
        IRepository<ClinicalProcedure> procedureRepo,
        IRepository<ClinicLabOrder> labOrderRepo,
        IClinicContext clinicContext)
    {
        _queueRepo = queueRepo;
        _invoiceRepo = invoiceRepo;
        _paymentRepo = paymentRepo;
        _consultationRepo = consultationRepo;
        _procedureRepo = procedureRepo;
        _labOrderRepo = labOrderRepo;
        _clinicContext = clinicContext;
    }

    public async Task<DailyEodReportDto> Handle(GetDailyEodReportQuery request, CancellationToken cancellationToken)
    {
        var targetDate = request.Date?.Date ?? DateTime.UtcNow.Date;
        var nextDay = targetDate.AddDays(1);

        // 1. Queue & Visits Census
        var queueItems = await _queueRepo.Query(q => q.CheckInTime >= targetDate && q.CheckInTime < nextDay)
            .ToListAsync(cancellationToken);

        int totalCheckedIn = queueItems.Count;
        int totalAppointments = queueItems.Count(q => q.AppointmentId.HasValue);
        int totalWalkIns = totalCheckedIn - totalAppointments;
        int totalCompletedVisits = queueItems.Count(q => q.Status == QueueStatus.Completed);
        int totalWaitingOrInConsultation = queueItems.Count(q => q.Status == QueueStatus.Waiting || q.Status == QueueStatus.Triaged || q.Status == QueueStatus.InConsultation);

        // 2. Invoices & Billing
        var invoices = await _invoiceRepo.Query(i => i.InvoiceDate >= targetDate && i.InvoiceDate < nextDay && i.Status != InvoiceStatus.Voided && i.Status != InvoiceStatus.Refunded)
            .ToListAsync(cancellationToken);

        decimal totalGrossAmount = invoices.Sum(i => i.GrossAmount);
        decimal totalDiscountsGiven = invoices.Sum(i => i.DiscountAmount);
        decimal totalSeniorDiscounts = invoices.Where(i => i.DiscountType == DiscountType.SeniorCitizen).Sum(i => i.DiscountAmount);
        decimal totalPwdDiscounts = invoices.Where(i => i.DiscountType == DiscountType.Pwd).Sum(i => i.DiscountAmount);
        decimal totalPhilHealthCovered = invoices.Where(i => i.DiscountType == DiscountType.PhilHealthKonsulta).Sum(i => i.DiscountAmount);
        decimal totalNetAmount = invoices.Sum(i => i.NetAmount);
        decimal totalUnpaidBalances = invoices.Sum(i => i.BalanceDue);

        // 3. Payments & Cash Handover Remittance
        var payments = await _paymentRepo.Query(p => p.PaymentDate >= targetDate && p.PaymentDate < nextDay)
            .ToListAsync(cancellationToken);

        decimal totalAmountCollected = payments.Sum(p => p.Amount);
        decimal cashInDrawer = payments.Where(p => p.Method == PaymentMethod.Cash).Sum(p => p.Amount);

        var collectionsByMethod = payments
            .GroupBy(p => p.Method.ToString())
            .Select(g => new PaymentModeSummary(
                g.Key,
                g.Sum(p => p.Amount),
                g.Count()
            ))
            .OrderByDescending(s => s.TotalAmount)
            .ToList();

        // 4. Clinical Consultations & Doctor Workloads
        var consultations = await _consultationRepo.Query(c => c.EncounterDate >= targetDate && c.EncounterDate < nextDay)
            .Include(c => c.Prescriptions)
            .ToListAsync(cancellationToken);

        var doctorWorkloads = consultations
            .GroupBy(c => c.DoctorName)
            .Select(g => new DoctorWorkloadSummary(g.Key, g.Count()))
            .OrderByDescending(w => w.EncountersCount)
            .ToList();

        int totalPrescriptionsWritten = consultations.Sum(c => c.Prescriptions.Count);
        int totalDangerousDrugPrescriptions = consultations.Sum(c => c.Prescriptions.Count(p => p.IsDangerousDrug));

        // 5. In-Clinic Procedures & Lab Orders
        int totalProceduresPerformed = await _procedureRepo.Query(p => p.ScheduledAt >= targetDate && p.ScheduledAt < nextDay && p.Status == ProcedureStatus.Completed)
            .CountAsync(cancellationToken);

        int totalLabOrdersIssued = await _labOrderRepo.Query(o => o.OrderDate >= targetDate && o.OrderDate < nextDay)
            .CountAsync(cancellationToken);

        return new DailyEodReportDto(
            targetDate,
            _clinicContext.TenantId,
            _clinicContext.ClinicId,
            totalCheckedIn,
            totalWalkIns,
            totalAppointments,
            totalCompletedVisits,
            totalWaitingOrInConsultation,
            totalGrossAmount,
            totalDiscountsGiven,
            totalSeniorDiscounts,
            totalPwdDiscounts,
            totalPhilHealthCovered,
            totalNetAmount,
            totalAmountCollected,
            cashInDrawer,
            totalUnpaidBalances,
            collectionsByMethod,
            doctorWorkloads,
            totalProceduresPerformed,
            totalLabOrdersIssued,
            totalPrescriptionsWritten,
            totalDangerousDrugPrescriptions
        );
    }
}
