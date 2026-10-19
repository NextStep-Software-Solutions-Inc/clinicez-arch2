using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Application.Common;
using ClinicEz.Pharmacy.Application.Common.Interfaces;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.Commands;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.DTOs;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Domain.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interoperability;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Pharmacy.Application.Features.Gamot.Commands;

public sealed record DispenseGamotPrescriptionCommand(
    Guid PrescriptionOrderId,
    string PharmacistName,
    string PharmacistPrcLicense,
    string HciAccreditationNumber,
    string? ReceiptNumber = null,
    string? Notes = null,
    List<ManualBatchSelectionInput>? ManualBatchSelections = null
) : IRequest<ApiResponse<PrescriptionOrderDto>>;

public sealed class DispenseGamotPrescriptionCommandValidator : AbstractValidator<DispenseGamotPrescriptionCommand>
{
    public DispenseGamotPrescriptionCommandValidator()
    {
        RuleFor(x => x.PrescriptionOrderId).NotEmpty();
        RuleFor(x => x.PharmacistName).NotEmpty().MaximumLength(255);
        RuleFor(x => x.PharmacistPrcLicense).NotEmpty().MaximumLength(100);
        RuleFor(x => x.HciAccreditationNumber).NotEmpty().MaximumLength(50);
    }
}

public sealed class DispenseGamotPrescriptionCommandHandler : IRequestHandler<DispenseGamotPrescriptionCommand, ApiResponse<PrescriptionOrderDto>>
{
    private readonly IRepository<PrescriptionOrder> _orderRepo;
    private readonly IRepository<PharmacyInventoryItem> _inventoryRepo;
    private readonly IRepository<DispenseAuditRecord> _auditRepo;
    private readonly IRepository<GamotBeneficiaryLedger> _ledgerRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IPrescriptionDispensedPublisher _dispensedPublisher;
    private readonly IUpscSecurityService _upscService;
    private readonly IGamotFormularyService _formularyService;

    public DispenseGamotPrescriptionCommandHandler(
        IRepository<PrescriptionOrder> orderRepo,
        IRepository<PharmacyInventoryItem> inventoryRepo,
        IRepository<DispenseAuditRecord> auditRepo,
        IRepository<GamotBeneficiaryLedger> ledgerRepo,
        IUnitOfWork unitOfWork,
        IPrescriptionDispensedPublisher dispensedPublisher,
        IUpscSecurityService upscService,
        IGamotFormularyService formularyService)
    {
        _orderRepo = orderRepo;
        _inventoryRepo = inventoryRepo;
        _auditRepo = auditRepo;
        _ledgerRepo = ledgerRepo;
        _unitOfWork = unitOfWork;
        _dispensedPublisher = dispensedPublisher;
        _upscService = upscService;
        _formularyService = formularyService;
    }

    public async Task<ApiResponse<PrescriptionOrderDto>> Handle(
        DispenseGamotPrescriptionCommand request,
        CancellationToken cancellationToken)
    {
        var order = await _orderRepo.Query(o => o.Id == request.PrescriptionOrderId)
            .Include(o => o.Items)
            .Include(o => o.DispenseRecords)
            .FirstOrDefaultAsync(cancellationToken);

        if (order == null)
        {
            throw new NotFoundException($"Prescription order with ID '{request.PrescriptionOrderId}' was not found.");
        }

        if (order.Status == PrescriptionStatus.Dispensed)
        {
            throw new BadRequestException("Prescription has already been dispensed.");
        }

        if (order.Status is PrescriptionStatus.Cancelled or PrescriptionStatus.Rejected)
        {
            throw new BadRequestException($"{order.Status} prescriptions cannot be dispensed.");
        }

        PrescriptionDispenseGate.EnsureCanDispense(order);

        var pin = !string.IsNullOrWhiteSpace(order.PhilHealthIdentificationNumber)
            ? new string(order.PhilHealthIdentificationNumber.Where(char.IsDigit).ToArray()).PadLeft(12, '0')
            : "000000000000";

        var currentYear = DateTime.UtcNow.Year.ToString();

        // 1. Fetch or create GamotBeneficiaryLedger
        var ledger = await _ledgerRepo.Query(l => l.PhilHealthIdentificationNumber == pin && l.BenefitYear == currentYear)
            .Include(l => l.Transactions)
            .FirstOrDefaultAsync(cancellationToken);

        if (ledger == null)
        {
            ledger = new GamotBeneficiaryLedger
            {
                Id = Guid.NewGuid(),
                TenantId = order.TenantId,
                PharmacyId = order.PharmacyId,
                PatientId = order.PatientId,
                PatientName = order.PatientName,
                PhilHealthIdentificationNumber = pin,
                MemberPhilHealthIdentificationNumber = order.PhilHealthMemberPin,
                BenefitYear = currentYear,
                AnnualAllocation = GamotBeneficiaryLedger.DefaultAnnualAllocation,
                TotalAmountUtilized = 0.00m,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = request.PharmacistName
            };
            await _ledgerRepo.AddAsync(ledger, cancellationToken);
        }

        // 2. Validate and price GAMOT items
        decimal totalGamotAmount = 0.00m;
        foreach (var item in order.Items.Where(i => i.Status != ItemDispenseStatus.Rejected))
        {
            if (string.IsNullOrWhiteSpace(item.PhilHealthDrugCode))
            {
                var match = _formularyService.MatchByGenericName(item.GenericName, item.Dosage);
                if (match != null)
                {
                    item.PhilHealthDrugCode = match.DrugCode;
                    item.GamotReferencePrice = match.ReferenceUnitPrice;
                    item.IsGamotCovered = true;
                }
            }

            if (item.IsGamotCovered)
            {
                // Ensure UPSC exists and is verified
                if (string.IsNullOrWhiteSpace(item.UniquePrescriptionSecurityCode))
                {
                    item.UniquePrescriptionSecurityCode = _upscService.GenerateUpsc(
                        request.HciAccreditationNumber,
                        pin,
                        order.PrescriptionNumber,
                        order.DoctorPrcLicense,
                        item.PhilHealthDrugCode ?? "NOMED",
                        item.QuantityPrescribed,
                        order.IssuedAt);
                }
                else if (!_upscService.VerifyChecksum(item.UniquePrescriptionSecurityCode))
                {
                    throw new BadRequestException(
                        $"Prescription item '{item.GenericName}' has an invalid or tampered UPSC checksum '{item.UniquePrescriptionSecurityCode}'.");
                }

                var refPrice = item.GamotReferencePrice ?? item.UnitPrice;
                totalGamotAmount += item.QuantityPrescribed * refPrice;
            }
        }

        // 3. Verify ledger balance
        if (totalGamotAmount > ledger.RemainingBalance)
        {
            throw new BadRequestException(
                $"Insufficient PhilHealth GAMOT benefit balance. Available: PHP {ledger.RemainingBalance:F2}, Required: PHP {totalGamotAmount:F2}.");
        }

        // 4. Deduct Inventory (FEFO)
        var allDeductions = new List<object>();
        var dispensedMedications = new List<DispensedMedicationDto>();

        foreach (var item in order.Items.Where(i => i.Status != ItemDispenseStatus.Rejected))
        {
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

            inventoryItem.CurrentStock = inventoryItem.Batches
                .Where(b => b.Status == BatchStatus.Active && b.ExpiryDate > DateTime.UtcNow)
                .Sum(b => b.QuantityRemaining);
            inventoryItem.UpdatedAt = DateTime.UtcNow;
            inventoryItem.UpdatedBy = request.PharmacistName;

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

            // 5. Debit GAMOT Ledger for covered items
            if (item.IsGamotCovered)
            {
                var refPrice = item.GamotReferencePrice ?? item.UnitPrice;
                ledger.Debit(
                    prescriptionOrderId: order.Id,
                    prescriptionOrderItemId: item.Id,
                    prescriptionNumber: order.PrescriptionNumber,
                    philHealthDrugCode: item.PhilHealthDrugCode ?? "NOMED",
                    genericName: item.GenericName,
                    brandName: item.BrandName,
                    quantity: item.QuantityDispensed,
                    unitPrice: refPrice,
                    upsc: item.UniquePrescriptionSecurityCode ?? "",
                    pharmacistName: request.PharmacistName,
                    pharmacistPrc: request.PharmacistPrcLicense,
                    hciAccreditationNumber: request.HciAccreditationNumber);
            }
        }

        var totalAmount = order.Items.Where(i => i.Status != ItemDispenseStatus.Rejected).Sum(i => i.Subtotal);

        order.Status = PrescriptionStatus.Dispensed;
        order.DispensedAt = DateTime.UtcNow;
        order.DispensingPharmacistName = request.PharmacistName.Trim();
        order.DispensingPharmacistPrc = request.PharmacistPrcLicense.Trim();
        order.TotalAmount = totalAmount;
        order.IsPhilHealthGamot = true;
        order.GamotCoverageAmount = totalGamotAmount;
        order.PatientCoPayAmount = Math.Max(0.00m, totalAmount - totalGamotAmount);
        order.UpdatedAt = DateTime.UtcNow;
        order.UpdatedBy = request.PharmacistName;

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

        // Queue rx.dispensed in the interop outbox BEFORE saving so it commits atomically with the dispense.
        var dispensedEvent = new PrescriptionDispensedEvent
        {
            DispenseId = auditRecord.Id,
            PrescriptionId = order.ExternalPrescriptionId != Guid.Empty ? order.ExternalPrescriptionId : order.Id,
            PrescriptionNumber = order.PrescriptionNumber,
            PharmacyFacilityId = order.PharmacyId,
            PharmacyFacilityName = order.PharmacyName,
            PharmacyTenantId = order.TenantId,
            DispensingPharmacistName = order.DispensingPharmacistName,
            DispensingPharmacistPrcLicense = order.DispensingPharmacistPrc,
            DispensedAt = order.DispensedAt.Value,
            DispensedItems = dispensedMedications,
            TotalAmount = totalAmount,
            ReceiptNumber = request.ReceiptNumber,
            Notes = request.Notes
        };

        _dispensedPublisher.Enqueue(order, dispensedEvent);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var dto = new PrescriptionOrderDto(
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
            },
            order.BranchId
        ).WithWorkflow(order);

        return ApiResponse<PrescriptionOrderDto>.Success(dto, "Prescription successfully verified and dispensed under PhilHealth GAMOT benefit.");
    }
}
