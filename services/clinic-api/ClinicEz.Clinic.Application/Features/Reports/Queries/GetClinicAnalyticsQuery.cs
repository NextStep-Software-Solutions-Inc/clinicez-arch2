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
using ClinicEz.Shared.Common;

namespace ClinicEz.Clinic.Application.Features.Reports.Queries;

public record GetClinicAnalyticsQuery(
    DateTime? StartDate = null,
    DateTime? EndDate = null
) : IRequest<ClinicAnalyticsDto>;

public class GetClinicAnalyticsQueryHandler : IRequestHandler<GetClinicAnalyticsQuery, ClinicAnalyticsDto>
{
    private readonly IRepository<QueueItem> _queueRepo;
    private readonly IRepository<Invoice> _invoiceRepo;
    private readonly IRepository<PaymentRecord> _paymentRepo;
    private readonly IRepository<ConsultationEncounter> _consultationRepo;
    private readonly IRepository<Procedure> _procedureRepo;
    private readonly IRepository<LabOrder> _labOrderRepo;
    private readonly IRepository<Patient>? _patientRepo;
    private readonly IClinicContext _clinicContext;

    public GetClinicAnalyticsQueryHandler(
        IRepository<QueueItem> queueRepo,
        IRepository<Invoice> invoiceRepo,
        IRepository<PaymentRecord> paymentRepo,
        IRepository<ConsultationEncounter> consultationRepo,
        IRepository<Procedure> procedureRepo,
        IRepository<LabOrder> labOrderRepo,
        IClinicContext clinicContext,
        IRepository<Patient>? patientRepo = null)
    {
        _queueRepo = queueRepo;
        _invoiceRepo = invoiceRepo;
        _paymentRepo = paymentRepo;
        _consultationRepo = consultationRepo;
        _procedureRepo = procedureRepo;
        _labOrderRepo = labOrderRepo;
        _clinicContext = clinicContext;
        _patientRepo = patientRepo;
    }

    public async Task<ClinicAnalyticsDto> Handle(GetClinicAnalyticsQuery request, CancellationToken cancellationToken)
    {
        var end = request.EndDate.HasValue
            ? request.EndDate.Value.ToEndOfDayExclusiveUtc()
            : DateTime.UtcNow.ToStartOfDayUtc().AddDays(1);
        var start = request.StartDate.HasValue
            ? request.StartDate.Value.ToStartOfDayUtc()
            : end.AddDays(-7);
        var today = DateTime.UtcNow.ToStartOfDayUtc();
        var tomorrow = today.AddDays(1);

        // 1. Flow & Telemetry (Today's queue telemetry)
        var todayQueue = await _queueRepo.Query(q => q.CheckInTime >= today && q.CheckInTime < tomorrow)
            .Select(q => new
            {
                q.Status,
                q.Priority,
                q.CheckInTime,
                q.CalledTime,
                q.CompletedTime
            })
            .ToListAsync(cancellationToken);

        int totalToday = todayQueue.Count;
        int inQueueNow = todayQueue.Count(q => q.Status == QueueStatus.Waiting || q.Status == QueueStatus.Triaged);
        int urgentNow = todayQueue.Count(q => (q.Priority == QueuePriority.Urgent || q.Priority == QueuePriority.Emergency) && q.Status != QueueStatus.Completed);
        int inConsultNow = todayQueue.Count(q => q.Status == QueueStatus.InConsultation);
        int completedToday = todayQueue.Count(q => q.Status == QueueStatus.Completed);

        var waitedItems = todayQueue.Where(q => q.CalledTime.HasValue && q.CalledTime > q.CheckInTime).ToList();
        double avgWait = waitedItems.Any()
            ? waitedItems.Average(q => (q.CalledTime!.Value - q.CheckInTime).TotalMinutes)
            : 0.0;

        var consultedItems = todayQueue.Where(q => q.CompletedTime.HasValue && q.CalledTime.HasValue && q.CompletedTime > q.CalledTime).ToList();
        double avgConsult = consultedItems.Any()
            ? consultedItems.Average(q => (q.CompletedTime!.Value - q.CalledTime!.Value).TotalMinutes)
            : 0.0;

        int routineCount = todayQueue.Count(q => q.Priority == QueuePriority.Routine);
        int urgentCount = todayQueue.Count(q => q.Priority == QueuePriority.Urgent);
        int emergencyCount = todayQueue.Count(q => q.Priority == QueuePriority.Emergency);

        var flowDto = new FlowAnalyticsDto(
            totalToday,
            inQueueNow,
            urgentNow,
            inConsultNow,
            completedToday,
            Math.Round(avgWait, 1),
            Math.Round(avgConsult, 1),
            routineCount,
            urgentCount,
            emergencyCount
        );

        // 2. Financial & Revenue
        var invoices = await _invoiceRepo.Query(i => i.InvoiceDate >= start && i.InvoiceDate < end && i.Status != InvoiceStatus.Voided && i.Status != InvoiceStatus.Refunded)
            .Select(i => new
            {
                i.InvoiceDate,
                i.GrossAmount,
                i.NetAmount,
                i.BalanceDue,
                i.DiscountType,
                i.DiscountAmount,
                LineItems = i.LineItems.Select(li => new { li.DoctorName, li.TotalPrice }).ToList()
            })
            .ToListAsync(cancellationToken);

        decimal totalGross = invoices.Sum(i => i.GrossAmount);
        decimal totalNet = invoices.Sum(i => i.NetAmount);
        decimal totalUnpaid = invoices.Sum(i => i.BalanceDue);
        decimal seniorDiscounts = invoices.Where(i => i.DiscountType == DiscountType.SeniorCitizen).Sum(i => i.DiscountAmount);
        decimal pwdDiscounts = invoices.Where(i => i.DiscountType == DiscountType.Pwd).Sum(i => i.DiscountAmount);
        decimal avgTicket = invoices.Any() ? Math.Round(totalNet / invoices.Count, 2) : 0;

        var payments = await _paymentRepo.Query(p => p.PaymentDate >= start && p.PaymentDate < end)
            .Select(p => new
            {
                p.PaymentDate,
                p.Amount,
                p.Method
            })
            .ToListAsync(cancellationToken);
        decimal totalCollections = payments.Sum(p => p.Amount);

        // Tender Shares
        var tenderShares = payments
            .GroupBy(p => p.Method.ToString())
            .Select(g =>
            {
                var sum = g.Sum(p => p.Amount);
                var pct = totalCollections > 0 ? (double)Math.Round((sum / totalCollections) * 100, 1) : 0.0;
                return new TenderShareDto(g.Key, sum, pct);
            })
            .OrderByDescending(t => t.TotalAmount)
            .ToList();

        // 7-day revenue trend points
        var trendPoints = new List<DailyTrendPointDto>();
        for (var day = start; day < end; day = day.AddDays(1))
        {
            var nextDay = day.AddDays(1);
            var dayInvoices = invoices.Where(i => i.InvoiceDate >= day && i.InvoiceDate < nextDay).ToList();
            var dayPayments = payments.Where(p => p.PaymentDate >= day && p.PaymentDate < nextDay).ToList();
            trendPoints.Add(new DailyTrendPointDto(
                day.ToString("MMM dd"),
                dayPayments.Sum(p => p.Amount),
                dayInvoices.Count
            ));
        }

        // 3. Clinical Morbidity (Top ICD-10 Diagnoses)
        var consultations = await _consultationRepo.Query(c => c.EncounterDate >= start && c.EncounterDate < end)
            .Include(c => c.Diagnoses)
            .Select(c => new
            {
                c.DoctorName,
                Diagnoses = c.Diagnoses.Select(d => new { d.Icd10Code, d.Description }).ToList()
            })
            .ToListAsync(cancellationToken);

        var allDiagnoses = consultations.SelectMany(c => c.Diagnoses).ToList();
        int totalDiagCount = allDiagnoses.Count;

        var topDiagnoses = allDiagnoses
            .GroupBy(d => new { d.Icd10Code, d.Description })
            .Select(g =>
            {
                var count = g.Count();
                var pct = totalDiagCount > 0 ? (double)Math.Round(((double)count / totalDiagCount) * 100, 1) : 0.0;
                return new MorbidityItemDto(g.Key.Icd10Code, g.Key.Description, count, pct);
            })
            .OrderByDescending(d => d.CaseCount)
            .Take(10)
            .ToList();

        // 4. Clinical Service Item Usage (Procedures & Lab Requisitions)
        var topProceduresData = await _procedureRepo.Query(p => p.ScheduledAt >= start && p.ScheduledAt < end)
            .GroupBy(p => p.ProcedureName)
            .Select(g => new
            {
                ProcedureName = g.Key,
                Quantity = g.Count()
            })
            .OrderByDescending(s => s.Quantity)
            .Take(5)
            .ToListAsync(cancellationToken);

        var topProcedures = topProceduresData
            .Select(g => new ServiceUsageDto("Procedure", g.ProcedureName, g.Quantity))
            .ToList();

        var labOrders = await _labOrderRepo.Query(o => o.OrderDate >= start && o.OrderDate < end)
            .Select(o => o.Items.Select(i => i.TestName).ToList())
            .ToListAsync(cancellationToken);

        var topLabs = labOrders
            .SelectMany(items => items)
            .GroupBy(testName => testName)
            .Select(g => new ServiceUsageDto("LabOrder", g.Key, g.Count()))
            .OrderByDescending(s => s.Quantity)
            .Take(5)
            .ToList();

        var topServices = topProcedures.Concat(topLabs).OrderByDescending(s => s.Quantity).ToList();

        // 5. Doctor Productivity
        var doctorStats = consultations
            .GroupBy(c => c.DoctorName)
            .Select(g =>
            {
                var docName = g.Key;
                var encounters = g.Count();
                var billed = invoices
                    .SelectMany(i => i.LineItems)
                    .Where(li => li.DoctorName != null && string.Equals(li.DoctorName, docName, StringComparison.OrdinalIgnoreCase))
                    .Sum(li => li.TotalPrice);
                return new DoctorStatDto(docName, encounters, billed);
            })
            .OrderByDescending(d => d.EncountersCount)
            .ToList();

        // 6. Extended Telemetry: Window Queue Flow, Hourly Arrivals, Visit Type, and Acuity
        var windowQueue = await _queueRepo.Query(q => q.CheckInTime >= start && q.CheckInTime < end)
            .Select(q => new
            {
                q.CheckInTime,
                q.AppointmentId,
                q.Priority,
                q.PatientId
            })
            .ToListAsync(cancellationToken);

        int totalWindowQueue = windowQueue.Count;

        // Hourly Arrival Velocity (Operating hours 07:00 through 18:00)
        var hourlyFlow = new List<HourlyFlowPointDto>();
        for (int h = 7; h <= 18; h++)
        {
            int hourCount = windowQueue.Count(q => q.CheckInTime.Hour == h);
            double pct = totalWindowQueue > 0 ? Math.Round(((double)hourCount / totalWindowQueue) * 100, 1) : 0.0;
            hourlyFlow.Add(new HourlyFlowPointDto(h, $"{h:D2}:00", hourCount, pct));
        }

        // Visit Type Split (Walk-In vs Pre-booked Appointment)
        int walkInCount = windowQueue.Count(q => !q.AppointmentId.HasValue);
        int apptCount = windowQueue.Count(q => q.AppointmentId.HasValue);
        double walkInPct = totalWindowQueue > 0 ? Math.Round(((double)walkInCount / totalWindowQueue) * 100, 1) : 0.0;
        double apptPct = totalWindowQueue > 0 ? Math.Round(((double)apptCount / totalWindowQueue) * 100, 1) : 0.0;
        var visitTypeSplit = new VisitTypeSplitDto(walkInCount, walkInPct, apptCount, apptPct);

        // Triage Acuity Distribution
        int routineTotal = windowQueue.Count(q => q.Priority == QueuePriority.Routine);
        int urgentTotal = windowQueue.Count(q => q.Priority == QueuePriority.Urgent);
        int emergencyTotal = windowQueue.Count(q => q.Priority == QueuePriority.Emergency);
        double routinePct = totalWindowQueue > 0 ? Math.Round(((double)routineTotal / totalWindowQueue) * 100, 1) : 0.0;
        double urgentPct = totalWindowQueue > 0 ? Math.Round(((double)urgentTotal / totalWindowQueue) * 100, 1) : 0.0;
        double emergencyPct = totalWindowQueue > 0 ? Math.Round(((double)emergencyTotal / totalWindowQueue) * 100, 1) : 0.0;
        var acuitySplit = new AcuitySplitDto(routineTotal, routinePct, urgentTotal, urgentPct, emergencyTotal, emergencyPct);

        // 7. Demographic Breakdown (Age Cohorts & Gender)
        var distinctPatientIds = windowQueue.Select(q => q.PatientId).Distinct().ToList();
        int pedCount = 0, adultCount = 0, seniorCount = 0;
        int maleCount = 0, femaleCount = 0, otherGenderCount = 0;

        if (_patientRepo != null && distinctPatientIds.Count > 0)
        {
            var patients = await _patientRepo.Query(p => distinctPatientIds.Contains(p.Id))
                .Select(p => new { p.DateOfBirth, p.Gender })
                .ToListAsync(cancellationToken);

            var todayDateOnly = DateOnly.FromDateTime(today);
            foreach (var p in patients)
            {
                var age = todayDateOnly.Year - p.DateOfBirth.Year;
                if (p.DateOfBirth > todayDateOnly.AddYears(-age)) age--;

                if (age < 18) pedCount++;
                else if (age >= 60) seniorCount++;
                else adultCount++;

                var g = p.Gender.ToString().ToLowerInvariant();
                if (g.StartsWith("m")) maleCount++;
                else if (g.StartsWith("f")) femaleCount++;
                else otherGenderCount++;
            }
        }
        int totalDemoPatients = pedCount + adultCount + seniorCount;
        var demographics = new DemographicDistributionDto(
            pedCount, totalDemoPatients > 0 ? Math.Round(((double)pedCount / totalDemoPatients) * 100, 1) : 0.0,
            adultCount, totalDemoPatients > 0 ? Math.Round(((double)adultCount / totalDemoPatients) * 100, 1) : 0.0,
            seniorCount, totalDemoPatients > 0 ? Math.Round(((double)seniorCount / totalDemoPatients) * 100, 1) : 0.0,
            maleCount, totalDemoPatients > 0 ? Math.Round(((double)maleCount / totalDemoPatients) * 100, 1) : 0.0,
            femaleCount, totalDemoPatients > 0 ? Math.Round(((double)femaleCount / totalDemoPatients) * 100, 1) : 0.0,
            otherGenderCount, totalDemoPatients > 0 ? Math.Round(((double)otherGenderCount / totalDemoPatients) * 100, 1) : 0.0
        );

        // 8. Financial Efficiency Metrics
        double collectionRate = totalNet > 0 ? (double)Math.Round((totalCollections / totalNet) * 100, 1) : 0.0;
        decimal totalDiscounts = seniorDiscounts + pwdDiscounts;
        double discountImpact = totalGross > 0 ? (double)Math.Round(((totalDiscounts) / (totalGross > 0 ? totalGross : 1m)) * 100, 1) : 0.0;
        decimal avgRevPerPatient = totalWindowQueue > 0 ? Math.Round(totalNet / totalWindowQueue, 2) : (invoices.Count > 0 ? Math.Round(totalNet / invoices.Count, 2) : 0m);

        var financialEfficiency = new FinancialEfficiencyDto(
            collectionRate,
            discountImpact,
            avgRevPerPatient,
            totalDiscounts
        );

        return new ClinicAnalyticsDto(
            start,
            end.AddDays(-1),
            _clinicContext.TenantId,
            _clinicContext.ClinicId,
            flowDto,
            totalGross,
            totalNet,
            totalCollections,
            totalUnpaid,
            avgTicket,
            seniorDiscounts,
            pwdDiscounts,
            trendPoints,
            tenderShares,
            topDiagnoses,
            topServices,
            doctorStats,
            hourlyFlow,
            visitTypeSplit,
            acuitySplit,
            demographics,
            financialEfficiency
        );
    }
}
