using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.DTOs;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Pharmacy.Application.Features.Prescriptions.Queries;

public record GetPrescriptionsQueueQuery(
    PrescriptionStatus? Status = null,
    string? Search = null,
    string? BranchId = null
) : IRequest<List<PrescriptionOrderDto>>;

public class GetPrescriptionsQueueQueryHandler : IRequestHandler<GetPrescriptionsQueueQuery, List<PrescriptionOrderDto>>
{
    private readonly IRepository<PrescriptionOrder> _orderRepo;

    public GetPrescriptionsQueueQueryHandler(IRepository<PrescriptionOrder> orderRepo)
    {
        _orderRepo = orderRepo;
    }

    public async Task<List<PrescriptionOrderDto>> Handle(GetPrescriptionsQueueQuery request, CancellationToken cancellationToken)
    {
        var query = _orderRepo.Query()
            .Include(o => o.Items)
            .Include(o => o.DispenseRecords)
            .AsNoTracking();

        if (request.Status.HasValue)
        {
            query = query.Where(o => o.Status == request.Status.Value);
        }

        if (!string.IsNullOrWhiteSpace(request.BranchId))
        {
            query = query.Where(o => o.BranchId == request.BranchId);
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim().ToLower();
            query = query.Where(o =>
                o.PrescriptionNumber.ToLower().Contains(search) ||
                o.PatientName.ToLower().Contains(search) ||
                o.OrderingDoctorName.ToLower().Contains(search));
        }

        var orders = await query
            .OrderByDescending(o => o.IssuedAt)
            .ToListAsync(cancellationToken);

        return orders.Select(o => new PrescriptionOrderDto(
            o.Id,
            o.TenantId,
            o.PharmacyId,
            o.ExternalPrescriptionId,
            o.PrescriptionNumber,
            o.OrderingFacilityId,
            o.OrderingFacilityName,
            o.OrderingDoctorName,
            o.DoctorPrcLicense,
            o.DoctorPtr,
            o.DoctorS2License,
            o.PatientId,
            o.PatientName,
            o.PatientAge,
            o.PatientGender,
            o.PatientContact,
            o.PatientAllergies,
            o.ClinicalDiagnosis,
            o.SpecialInstructions,
            o.Status.ToString(),
            o.IssuedAt,
            o.DispensedAt,
            o.DispensingPharmacistName,
            o.DispensingPharmacistPrc,
            o.TotalAmount,
            o.Items.Select(i => new PrescriptionItemResponseDto(
                i.Id,
                i.InventoryItemId,
                i.GenericName,
                i.BrandName,
                i.Dosage,
                i.Form,
                i.Sig,
                i.QuantityPrescribed,
                i.QuantityDispensed,
                i.AllocatedBatchNumber,
                i.AllocatedBatchExpiry,
                i.UnitPrice,
                i.Subtotal,
                i.Status.ToString(),
                i.IsDangerousDrug,
                i.Remarks,
                new List<BatchAllocationRecommendationDto>()
            )).ToList(),
            o.DispenseRecords.Select(d => new DispenseAuditRecordDto(
                d.Id,
                d.PharmacistName,
                d.PharmacistPrcLicense,
                d.DispensedAt,
                d.TotalAmount,
                d.ReceiptNumber,
                d.BatchDeductionsJson,
                d.Notes
            )).ToList(),
            o.BranchId
        )).ToList();
    }
}
