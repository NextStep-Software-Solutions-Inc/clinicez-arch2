using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Application.Common.Interfaces;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.DTOs;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Domain.Services;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interoperability;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Pharmacy.Application.Features.Prescriptions.Commands;

public record ManualBatchSelectionInput(
    Guid ItemId,
    Guid BatchId,
    int Quantity
);

public record DispensePrescriptionCommand(
    Guid PrescriptionId,
    string PharmacistName,
    string PharmacistPrcLicense,
    string? ReceiptNumber = null,
    string? Notes = null,
    List<ManualBatchSelectionInput>? ManualBatchSelections = null
) : IRequest<PrescriptionOrderDto>;

public class DispensePrescriptionCommandValidator : AbstractValidator<DispensePrescriptionCommand>
{
    public DispensePrescriptionCommandValidator()
    {
        RuleFor(x => x.PrescriptionId).NotEmpty();
        RuleFor(x => x.PharmacistName).NotEmpty().MaximumLength(255);
        RuleFor(x => x.PharmacistPrcLicense).NotEmpty().MaximumLength(100);
    }
}

public class DispensePrescriptionCommandHandler : IRequestHandler<DispensePrescriptionCommand, PrescriptionOrderDto>
{
    private readonly IRepository<PrescriptionOrder> _orderRepo;
    private readonly IRepository<PharmacyInventoryItem> _inventoryRepo;
    private readonly IRepository<DispenseAuditRecord> _auditRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IPrescriptionDispensedPublisher _dispensedPublisher;

    public DispensePrescriptionCommandHandler(
        IRepository<PrescriptionOrder> orderRepo,
        IRepository<PharmacyInventoryItem> inventoryRepo,
        IRepository<DispenseAuditRecord> auditRepo,
        IUnitOfWork unitOfWork,
        IPrescriptionDispensedPublisher dispensedPublisher)
    {
        _orderRepo = orderRepo;
        _inventoryRepo = inventoryRepo;
        _auditRepo = auditRepo;
        _unitOfWork = unitOfWork;
        _dispensedPublisher = dispensedPublisher;
    }

    public async Task<PrescriptionOrderDto> Handle(DispensePrescriptionCommand request, CancellationToken cancellationToken)
    {
        var order = await _orderRepo.Query(o => o.Id == request.PrescriptionId)
            .Include(o => o.Items)
            .Include(o => o.DispenseRecords)
            .FirstOrDefaultAsync(cancellationToken);

        if (order == null)
        {
            throw new NotFoundException($"Prescription order with ID '{request.PrescriptionId}' was not found.");
        }

        if (order.Status == PrescriptionStatus.Dispensed)
        {
            throw new BadRequestException($"Prescription '{order.PrescriptionNumber}' has already been dispensed.");
        }

        if (order.Status == PrescriptionStatus.Cancelled)
        {
            throw new BadRequestException($"Prescription '{order.PrescriptionNumber}' is cancelled and cannot be dispensed.");
        }

        // Regulatory enforcement: Check dangerous drugs vs S2 License
        var hasDangerousDrugs = order.Items.Any(i => i.IsDangerousDrug);
        if (hasDangerousDrugs && string.IsNullOrWhiteSpace(order.DoctorS2License))
        {
            throw new BadRequestException("Regulatory Compliance Violation (RA 9165): Cannot dispense dangerous drugs because the prescribing physician's S2 License is missing or unverified.");
        }

        var allDeductions = new List<object>();
        var dispensedMedications = new List<DispensedMedicationDto>();

        foreach (var item in order.Items)
        {
            // Find inventory item
            var searchName = item.GenericName.ToLower();
            var inventoryItem = await _inventoryRepo.Query(i =>
                (item.InventoryItemId.HasValue && i.Id == item.InventoryItemId.Value) ||
                i.GenericName.ToLower().Contains(searchName))
                .Include(i => i.Batches)
                .FirstOrDefaultAsync(cancellationToken);

            if (inventoryItem == null)
            {
                throw new BadRequestException($"Medication '{item.GenericName}' is not available in pharmacy inventory catalog.");
            }

            // Candidate batches for FEFO (Active, not depleted, not expired)
            var candidateBatches = inventoryItem.Batches
                .Where(b => b.Status == BatchStatus.Active && b.QuantityRemaining > 0 && b.ExpiryDate > DateTime.UtcNow)
                .OrderBy(b => b.ExpiryDate)
                .ThenBy(b => b.ReceivedDate)
                .ToList();

            var fefoResult = FefoInventoryAllocator.Allocate(item.QuantityPrescribed, candidateBatches);

            if (!fefoResult.IsFullyAllocated)
            {
                throw new BadRequestException(
                    $"Insufficient stock to dispense '{item.GenericName} {item.Dosage}'. " +
                    $"Requested: {item.QuantityPrescribed}, Available: {fefoResult.AllocatedQuantity}. Shortage: {fefoResult.Shortage}.");
            }

            // Apply deductions to batches
            var allocatedBatchesSummary = new List<string>();
            DateTime? earliestExpiry = null;

            foreach (var alloc in fefoResult.Allocations)
            {
                var batch = candidateBatches.First(b => b.Id == alloc.BatchId);
                batch.QuantityRemaining -= alloc.QuantityAllocated;
                if (batch.QuantityRemaining == 0)
                {
                    batch.Status = BatchStatus.Depleted;
                }
                batch.UpdatedAt = DateTime.UtcNow;
                batch.UpdatedBy = request.PharmacistName;

                allocatedBatchesSummary.Add($"{batch.BatchNumber} (Qty: {alloc.QuantityAllocated})");
                earliestExpiry ??= batch.ExpiryDate;

                allDeductions.Add(new
                {
                    Drug = item.GenericName,
                    BatchId = batch.Id,
                    BatchNumber = batch.BatchNumber,
                    ExpiryDate = batch.ExpiryDate.ToString("yyyy-MM-dd"),
                    DeductedQuantity = alloc.QuantityAllocated,
                    RemainingStock = batch.QuantityRemaining
                });
            }

            // Recalculate inventory item current stock
            inventoryItem.CurrentStock = inventoryItem.Batches
                .Where(b => b.Status == BatchStatus.Active && b.ExpiryDate > DateTime.UtcNow)
                .Sum(b => b.QuantityRemaining);
            inventoryItem.UpdatedAt = DateTime.UtcNow;
            inventoryItem.UpdatedBy = request.PharmacistName;

            // Update prescription order item
            item.InventoryItemId = inventoryItem.Id;
            item.QuantityDispensed = item.QuantityPrescribed;
            item.AllocatedBatchNumber = string.Join(", ", allocatedBatchesSummary);
            item.AllocatedBatchExpiry = earliestExpiry;
            item.UnitPrice = inventoryItem.UnitPrice;
            item.Subtotal = inventoryItem.UnitPrice * item.QuantityDispensed;
            item.Status = ItemDispenseStatus.Dispensed;
            item.UpdatedAt = DateTime.UtcNow;
            item.UpdatedBy = request.PharmacistName;

            dispensedMedications.Add(new DispensedMedicationDto
            {
                ItemId = item.Id,
                GenericName = item.GenericName,
                BrandName = item.BrandName,
                Dosage = item.Dosage,
                Form = item.Form,
                QuantityDispensed = item.QuantityDispensed,
                BatchNumber = item.AllocatedBatchNumber ?? "FEFO-AUTO",
                ExpiryDate = item.AllocatedBatchExpiry?.ToString("yyyy-MM-dd") ?? "N/A",
                UnitPrice = item.UnitPrice,
                Subtotal = item.Subtotal
            });
        }

        var totalAmount = order.Items.Sum(i => i.Subtotal);

        // Update prescription order header
        order.Status = PrescriptionStatus.Dispensed;
        order.DispensedAt = DateTime.UtcNow;
        order.DispensingPharmacistName = request.PharmacistName.Trim();
        order.DispensingPharmacistPrc = request.PharmacistPrcLicense.Trim();
        order.TotalAmount = totalAmount;
        order.UpdatedAt = DateTime.UtcNow;
        order.UpdatedBy = request.PharmacistName;

        // Record audit trail
        var auditRecord = new DispenseAuditRecord
        {
            Id = Guid.NewGuid(),
            PrescriptionOrderId = order.Id,
            PharmacistName = request.PharmacistName.Trim(),
            PharmacistPrcLicense = request.PharmacistPrcLicense.Trim(),
            DispensedAt = DateTime.UtcNow,
            TotalAmount = totalAmount,
            ReceiptNumber = request.ReceiptNumber,
            BatchDeductionsJson = JsonSerializer.Serialize(allDeductions),
            Notes = request.Notes,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = request.PharmacistName
        };

        await _auditRepo.AddAsync(auditRecord, cancellationToken);
        _orderRepo.Update(order);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Broadcast PrescriptionDispensedEvent over MassTransit RabbitMQ
        var dispensedEvent = new PrescriptionDispensedEvent
        {
            DispenseId = auditRecord.Id,
            PrescriptionId = order.ExternalPrescriptionId != Guid.Empty ? order.ExternalPrescriptionId : order.Id,
            PrescriptionNumber = order.PrescriptionNumber,
            PharmacyFacilityId = order.PharmacyId,
            PharmacyFacilityName = "ClinicEz Partner Pharmacy Hub",
            PharmacyTenantId = order.TenantId,
            DispensingPharmacistName = order.DispensingPharmacistName,
            DispensingPharmacistPrcLicense = order.DispensingPharmacistPrc,
            DispensedAt = order.DispensedAt.Value,
            DispensedItems = dispensedMedications,
            TotalAmount = totalAmount,
            ReceiptNumber = request.ReceiptNumber,
            Notes = request.Notes
        };

        await _dispensedPublisher.PublishPrescriptionDispensedAsync(dispensedEvent, cancellationToken);

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
            order.Items.Select(i => new PrescriptionItemResponseDto(
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
            new List<DispenseAuditRecordDto>
            {
                new(
                    auditRecord.Id,
                    auditRecord.PharmacistName,
                    auditRecord.PharmacistPrcLicense,
                    auditRecord.DispensedAt,
                    auditRecord.TotalAmount,
                    auditRecord.ReceiptNumber,
                    auditRecord.BatchDeductionsJson,
                    auditRecord.Notes
                )
            }
        );
    }
}
