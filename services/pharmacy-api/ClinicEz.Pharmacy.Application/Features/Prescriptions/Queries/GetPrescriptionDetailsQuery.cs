using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.DTOs;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Domain.Services;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Pharmacy.Application.Features.Prescriptions.Queries;

public record GetPrescriptionDetailsQuery(Guid Id) : IRequest<PrescriptionOrderDto>;

public class GetPrescriptionDetailsQueryHandler : IRequestHandler<GetPrescriptionDetailsQuery, PrescriptionOrderDto>
{
    private readonly IRepository<PrescriptionOrder> _orderRepo;
    private readonly IRepository<PharmacyInventoryItem> _inventoryRepo;

    public GetPrescriptionDetailsQueryHandler(
        IRepository<PrescriptionOrder> orderRepo,
        IRepository<PharmacyInventoryItem> inventoryRepo)
    {
        _orderRepo = orderRepo;
        _inventoryRepo = inventoryRepo;
    }

    public async Task<PrescriptionOrderDto> Handle(GetPrescriptionDetailsQuery request, CancellationToken cancellationToken)
    {
        var order = await _orderRepo.Query(o => o.Id == request.Id)
            .Include(o => o.Items)
            .Include(o => o.DispenseRecords)
            .FirstOrDefaultAsync(cancellationToken);

        if (order == null)
        {
            throw new NotFoundException($"Prescription order with ID '{request.Id}' was not found.");
        }

        var itemResponses = new List<PrescriptionItemResponseDto>();

        foreach (var item in order.Items)
        {
            var availableBatches = new List<BatchAllocationRecommendationDto>();

            // Find matching inventory item to load active batches
            var searchName = item.GenericName.ToLower();
            var inventoryItem = await _inventoryRepo.Query(i =>
                (item.InventoryItemId.HasValue && i.Id == item.InventoryItemId.Value) ||
                i.GenericName.ToLower().Contains(searchName))
                .Include(i => i.Batches)
                .FirstOrDefaultAsync(cancellationToken);

            if (inventoryItem != null)
            {
                var candidateBatches = inventoryItem.Batches
                    .Where(b => b.Status == BatchStatus.Active && b.QuantityRemaining > 0 && b.ExpiryDate > DateTime.UtcNow)
                    .OrderBy(b => b.ExpiryDate)
                    .ToList();

                var fefoPlan = FefoInventoryAllocator.Allocate(item.QuantityPrescribed, candidateBatches);

                foreach (var batch in candidateBatches)
                {
                    var allocated = fefoPlan.Allocations.FirstOrDefault(a => a.BatchId == batch.Id)?.QuantityAllocated ?? 0;
                    availableBatches.Add(new BatchAllocationRecommendationDto(
                        batch.Id,
                        batch.BatchNumber,
                        batch.ExpiryDate,
                        batch.QuantityRemaining,
                        allocated
                    ));
                }
            }

            itemResponses.Add(new PrescriptionItemResponseDto(
                item.Id,
                item.InventoryItemId ?? inventoryItem?.Id,
                item.GenericName,
                item.BrandName ?? inventoryItem?.BrandName,
                item.Dosage,
                item.Form,
                item.Sig,
                item.QuantityPrescribed,
                item.QuantityDispensed,
                item.AllocatedBatchNumber,
                item.AllocatedBatchExpiry,
                item.UnitPrice > 0 ? item.UnitPrice : (inventoryItem?.UnitPrice ?? 10m),
                item.Subtotal > 0 ? item.Subtotal : ((inventoryItem?.UnitPrice ?? 10m) * item.QuantityPrescribed),
                item.Status.ToString(),
                item.IsDangerousDrug,
                item.Remarks,
                availableBatches
            ));
        }

        return new PrescriptionOrderDto(
            order.Id,
            order.TenantId,
            order.PharmacyId,
            order.ExternalPrescriptionId,
            order.PrescriptionNumber,
            order.OrderingFacilityId,
            order.OrderingFacilityName,
            order.OrderingDoctorName,
            order.DoctorPrcLicense,
            order.DoctorPtr,
            order.DoctorS2License,
            order.PatientId,
            order.PatientName,
            order.PatientAge,
            order.PatientGender,
            order.PatientContact,
            order.PatientAllergies,
            order.ClinicalDiagnosis,
            order.SpecialInstructions,
            order.Status.ToString(),
            order.IssuedAt,
            order.DispensedAt,
            order.DispensingPharmacistName,
            order.DispensingPharmacistPrc,
            order.TotalAmount,
            itemResponses,
            order.DispenseRecords.Select(d => new DispenseAuditRecordDto(
                d.Id,
                d.PharmacistName,
                d.PharmacistPrcLicense,
                d.DispensedAt,
                d.TotalAmount,
                d.ReceiptNumber,
                d.BatchDeductionsJson,
                d.Notes
            )).ToList(),
            order.BranchId
        ).WithWorkflow(order);
    }
}
