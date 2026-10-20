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
    private readonly IRepository<ClinicSettings>? _settingsRepo;

    public GetDailyEodReportQueryHandler(
        IRepository<QueueItem> queueRepo,
        IRepository<Invoice> invoiceRepo,
        IRepository<PaymentRecord> paymentRepo,
        IRepository<ConsultationEncounter> consultationRepo,
        IRepository<ClinicalProcedure> procedureRepo,
        IRepository<ClinicLabOrder> labOrderRepo,
        IClinicContext clinicContext,
        IRepository<ClinicSettings>? settingsRepo = null)
    {
        _queueRepo = queueRepo;
        _invoiceRepo = invoiceRepo;
        _paymentRepo = paymentRepo;
        _consultationRepo = consultationRepo;
        _procedureRepo = procedureRepo;
        _labOrderRepo = labOrderRepo;
        _clinicContext = clinicContext;
        _settingsRepo = settingsRepo;
    }

    public async Task<DailyEodReportDto> Handle(GetDailyEodReportQuery request, CancellationToken cancellationToken)
    {
        var targetDate = request.Date?.Date ?? DateTime.UtcNow.Date;
        var nextDay = targetDate.AddDays(1);

        ClinicSettings? settings = null;
        if (_settingsRepo != null)
        {
            settings = await _settingsRepo.Query().FirstOrDefaultAsync(cancellationToken);
        }

        // 1. Queue & Visits Census
        var queueItems = await _queueRepo.Query(q => q.CheckInTime >= targetDate && q.CheckInTime < nextDay)
            .Select(q => new
            {
                q.AppointmentId,
                q.Status
            })
            .ToListAsync(cancellationToken);

        int totalCheckedIn = queueItems.Count;
        int totalAppointments = queueItems.Count(q => q.AppointmentId.HasValue);
        int totalWalkIns = totalCheckedIn - totalAppointments;
        int totalCompletedVisits = queueItems.Count(q => q.Status == QueueStatus.Completed);
        int totalWaitingOrInConsultation = queueItems.Count(q => q.Status == QueueStatus.Waiting || q.Status == QueueStatus.Triaged || q.Status == QueueStatus.InConsultation);

        // 2. Invoices & Billing
        var invoices = await _invoiceRepo.Query(i => i.InvoiceDate >= targetDate && i.InvoiceDate < nextDay && i.Status != InvoiceStatus.Voided && i.Status != InvoiceStatus.Refunded)
            .Select(i => new
            {
                i.GrossAmount,
                i.DiscountAmount,
                i.DiscountType,
                i.NetAmount,
                i.BalanceDue
            })
            .ToListAsync(cancellationToken);

        decimal totalGrossAmount = invoices.Sum(i => i.GrossAmount);
        decimal totalDiscountsGiven = invoices.Sum(i => i.DiscountAmount);
        decimal totalSeniorDiscounts = invoices.Where(i => i.DiscountType == DiscountType.SeniorCitizen).Sum(i => i.DiscountAmount);
        decimal totalPwdDiscounts = invoices.Where(i => i.DiscountType == DiscountType.Pwd).Sum(i => i.DiscountAmount);
        decimal totalPhilHealthCovered = invoices.Where(i => i.DiscountType == DiscountType.PhilHealthKonsulta).Sum(i => i.DiscountAmount);
        decimal totalNetAmount = invoices.Sum(i => i.NetAmount);
        decimal totalUnpaidBalances = invoices.Sum(i => i.BalanceDue);

        // 3. Payments & Cash Handover Remittance
        var collectionsData = await _paymentRepo.Query(p => p.PaymentDate >= targetDate && p.PaymentDate < nextDay)
            .GroupBy(p => p.Method)
            .Select(g => new
            {
                Method = g.Key,
                TotalAmount = g.Sum(p => p.Amount),
                TransactionCount = g.Count()
            })
            .OrderByDescending(s => s.TotalAmount)
            .ToListAsync(cancellationToken);

        var collectionsByMethod = collectionsData
            .Select(g => new PaymentModeSummary(
                g.Method.ToString(),
                g.TotalAmount,
                g.TransactionCount
            ))
            .ToList();

        decimal totalAmountCollected = collectionsByMethod.Sum(s => s.TotalAmount);
        decimal cashInDrawer = collectionsData.Where(s => s.Method == PaymentMethod.Cash).Sum(s => s.TotalAmount);

        // 4. Clinical Consultations & Doctor Workloads
        var doctorWorkloadData = await _consultationRepo.Query(c => c.EncounterDate >= targetDate && c.EncounterDate < nextDay)
            .GroupBy(c => c.DoctorName)
            .Select(g => new
            {
                DoctorName = g.Key,
                EncountersCount = g.Count()
            })
            .OrderByDescending(w => w.EncountersCount)
            .ToListAsync(cancellationToken);

        var doctorWorkloads = doctorWorkloadData
            .Select(g => new DoctorWorkloadSummary(g.DoctorName, g.EncountersCount))
            .ToList();

        var prescriptionData = await _consultationRepo.Query(c => c.EncounterDate >= targetDate && c.EncounterDate < nextDay)
            .Select(c => new
            {
                TotalPrescriptions = c.Prescriptions.Count,
                DangerousPrescriptions = c.Prescriptions.Count(p => p.IsDangerousDrug)
            })
            .ToListAsync(cancellationToken);

        int totalPrescriptionsWritten = prescriptionData.Sum(p => p.TotalPrescriptions);
        int totalDangerousDrugPrescriptions = prescriptionData.Sum(p => p.DangerousPrescriptions);

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
