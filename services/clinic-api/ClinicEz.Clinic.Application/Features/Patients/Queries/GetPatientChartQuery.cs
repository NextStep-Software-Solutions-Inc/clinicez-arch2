using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Procedures.DTOs;
using ClinicEz.Clinic.Application.Features.Triage.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;

public record GetPatientChartQuery(Guid PatientId) : IRequest<PatientChartDto>;

public class GetPatientChartQueryHandler : IRequestHandler<GetPatientChartQuery, PatientChartDto>
{
    private readonly IRepository<ConsultationEncounter> _consultationRepo;
    private readonly IRepository<TriageVitals> _triageRepo;
    private readonly IRepository<ClinicalProcedure> _procedureRepo;
    private readonly IRepository<ClinicLabOrder> _labOrderRepo;
    private readonly IRepository<Invoice> _invoiceRepo;
    private readonly IClinicContext _clinicContext;

    public GetPatientChartQueryHandler(
        IRepository<ConsultationEncounter> consultationRepo,
        IRepository<TriageVitals> triageRepo,
        IRepository<ClinicalProcedure> procedureRepo,
        IRepository<ClinicLabOrder> labOrderRepo,
        IRepository<Invoice> invoiceRepo,
        IClinicContext clinicContext)
    {
        _consultationRepo = consultationRepo;
        _triageRepo = triageRepo;
        _procedureRepo = procedureRepo;
        _labOrderRepo = labOrderRepo;
        _invoiceRepo = invoiceRepo;
        _clinicContext = clinicContext;
    }

    public async Task<PatientChartDto> Handle(GetPatientChartQuery request, CancellationToken cancellationToken)
    {
        if (request.PatientId == Guid.Empty)
        {
            throw new BadRequestException("PatientId is required to query patient chart.");
        }

        // Consultations
        var consultations = await _consultationRepo.Query(c => c.PatientId == request.PatientId)
            .Include(c => c.Diagnoses)
            .Include(c => c.Prescriptions)
            .OrderByDescending(c => c.EncounterDate)
            .ToListAsync(cancellationToken);

        // Vitals
        var vitals = await _triageRepo.Query(v => v.PatientId == request.PatientId)
            .OrderByDescending(v => v.RecordedAt)
            .ToListAsync(cancellationToken);

        // Procedures
        var procedures = await _procedureRepo.Query(p => p.PatientId == request.PatientId)
            .OrderByDescending(p => p.ScheduledAt)
            .ToListAsync(cancellationToken);

        // Lab Orders
        var labOrders = await _labOrderRepo.Query(l => l.PatientId == request.PatientId)
            .Include(l => l.Items)
            .OrderByDescending(l => l.OrderDate)
            .ToListAsync(cancellationToken);

        // Invoices
        var invoices = await _invoiceRepo.Query(i => i.PatientId == request.PatientId)
            .Include(i => i.LineItems)
            .Include(i => i.Payments)
            .OrderByDescending(i => i.InvoiceDate)
            .ToListAsync(cancellationToken);

        var patientName = consultations.FirstOrDefault()?.PatientName
            ?? vitals.FirstOrDefault()?.QueueItem?.PatientName
            ?? procedures.FirstOrDefault()?.PatientName
            ?? invoices.FirstOrDefault()?.PatientName
            ?? "Registered Patient";

        var consultationDtos = consultations.Select(c => new ConsultationEncounterDto(
            c.Id,
            c.TenantId ?? _clinicContext.TenantId,
            c.ClinicId,
            c.QueueItemId,
            c.AppointmentId,
            c.PatientId,
            c.PatientName,
            c.DoctorId,
            c.DoctorName,
            c.EncounterDate,
            c.Subjective,
            c.Objective,
            c.Assessment,
            c.Plan,
            c.DoctorPrcLicense,
            c.DoctorPtr,
            c.DoctorS2License,
            c.IsSigned,
            c.SignedAt,
            c.Diagnoses.Select(d => new EncounterDiagnosisDto(d.Id, d.Icd10Code, d.Description, d.IsPrimary)).ToList(),
            c.Prescriptions.Select(p => new PrescriptionItemDto(
                p.Id,
                p.GenericName,
                p.BrandName,
                p.Dosage,
                p.Form,
                p.Sig,
                p.Quantity,
                p.DurationDays,
                p.Refills,
                p.IsDangerousDrug,
                p.Remarks
            )).ToList()
        )).ToList();

        var vitalsDtos = vitals.Select(v => new TriageVitalsDto(
            v.Id,
            v.TenantId ?? _clinicContext.TenantId,
            v.ClinicId,
            v.QueueItemId,
            v.PatientId,
            v.NurseId,
            v.RecordedByNurseName,
            v.RecordedAt,
            v.SystolicBp,
            v.DiastolicBp,
            v.HeartRateBpm,
            v.TemperatureCelsius,
            v.RespiratoryRateBreathsPerMin,
            v.OxygenSaturationPercent,
            v.HeightCm,
            v.WeightKg,
            v.Bmi,
            v.PainScore,
            v.Notes
        )).ToList();

        var procedureDtos = procedures.Select(p => new ClinicalProcedureDto(
            p.Id,
            p.TenantId ?? _clinicContext.TenantId,
            p.ClinicId,
            p.PatientId,
            p.PatientName,
            p.QueueItemId,
            p.ConsultationId,
            p.ProcedureCode,
            p.ProcedureName,
            p.Category,
            p.OrderedByDoctorId,
            p.OrderedByDoctorName,
            p.PerformedByStaffId,
            p.PerformedByStaffName,
            p.PerformedAt,
            p.ScheduledAt,
            p.Status,
            p.PreProcedureVitalsJson,
            p.PostProcedureVitalsJson,
            p.MedicationAdministered,
            p.LotNumber,
            p.ExpirationDate,
            p.SiteRoute,
            p.ClinicalNotes,
            p.Complications
        )).ToList();

        var labOrderDtos = labOrders.Select(l => new ClinicLabOrderDto(
            l.Id,
            l.TenantId ?? _clinicContext.TenantId,
            l.ClinicId,
            l.OrderNumber,
            l.PatientId,
            l.PatientName,
            l.ConsultationId,
            l.OrderedByDoctorId,
            l.OrderedByDoctorName,
            l.OrderDate,
            l.Status,
            l.ClinicalDiagnosis,
            l.Notes,
            l.Items.Select(i => new ClinicLabOrderItemDto(
                i.Id,
                i.TestName,
                i.Category,
                i.Instructions,
                i.Status
            )).ToList()
        )).ToList();

        var invoiceDtos = invoices.Select(i => new InvoiceDto(
            i.Id,
            i.TenantId ?? _clinicContext.TenantId,
            i.ClinicId,
            i.InvoiceNumber,
            i.InvoiceDate,
            i.PatientId,
            i.PatientName,
            i.QueueItemId,
            i.AppointmentId,
            i.ConsultationId,
            i.AttendingDoctorId,
            i.AttendingDoctorName,
            i.GrossAmount,
            i.DiscountType,
            i.DiscountIdNumber,
            i.DiscountPercentage,
            i.DiscountAmount,
            i.NetAmount,
            i.AmountPaid,
            i.BalanceDue,
            i.Status,
            i.Notes,
            i.BilledByStaffName,
            i.LineItems.Select(li => new InvoiceLineItemDto(
                li.Id,
                li.ServiceItemId,
                li.ItemCode,
                li.Description,
                li.Category,
                li.UnitPrice,
                li.Quantity,
                li.TotalPrice
            )).ToList(),
            i.Payments.Select(p => new PaymentRecordDto(
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

        return new PatientChartDto(
            request.PatientId,
            patientName,
            consultations.Count,
            consultationDtos,
            vitalsDtos,
            procedureDtos,
            labOrderDtos,
            invoiceDtos
        );
    }
}
