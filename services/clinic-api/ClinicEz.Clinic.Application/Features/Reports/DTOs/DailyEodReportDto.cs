using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Reports.DTOs;

public record PaymentModeSummary(
    string Method,
    decimal TotalAmount,
    int TransactionCount
);

public record DoctorWorkloadSummary(
    string DoctorName,
    int EncountersCount
);

public record DailyEodReportDto(
    DateTime ReportDate,
    string TenantId,
    Guid ClinicId,
    // Patient Census
    int TotalCheckedIn,
    int TotalWalkIns,
    int TotalAppointments,
    int TotalCompletedVisits,
    int TotalWaitingOrInConsultation,
    // Financial & Cashier Remittance
    decimal TotalGrossAmount,
    decimal TotalDiscountsGiven,
    decimal TotalSeniorDiscounts,
    decimal TotalPwdDiscounts,
    decimal TotalPhilHealthCovered,
    decimal TotalNetAmount,
    decimal TotalAmountCollected,
    decimal CashInDrawer,
    decimal TotalUnpaidBalances,
    List<PaymentModeSummary> CollectionsByMethod,
    // Doctor & Clinical Activity
    List<DoctorWorkloadSummary> DoctorWorkloads,
    int TotalProceduresPerformed,
    int TotalLabOrdersIssued,
    int TotalPrescriptionsWritten,
    int TotalDangerousDrugPrescriptions
);
