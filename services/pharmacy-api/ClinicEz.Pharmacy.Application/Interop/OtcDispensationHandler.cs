using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Domain.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Pharmacy.Application.Interop;

/// <summary>
/// <c>pharmacy.otc.dispensed</c>: an in-clinic cashier station dispenses retail OTC medications or supplies.
/// The handler receives the outbox event in the provisioned pharmacy scope, decrements stock using FEFO allocation,
/// records an audit record, and guarantees idempotency based on the invoice ID.
/// </summary>
public sealed class OtcDispensationHandler : IInteropHandler<PharmacyOtcDispensedPayload>
{
    private readonly IRepository<PrescriptionOrder> _orderRepository;
    private readonly IRepository<PharmacyInventoryItem> _inventoryRepository;
    private readonly IRepository<PharmacySettings> _settingsRepository;
    private readonly IRepository<DispenseAuditRecord> _auditRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IPharmacyScopeSetter _scope;
    private readonly ILogger<OtcDispensationHandler> _logger;

    public OtcDispensationHandler(
        IRepository<PrescriptionOrder> orderRepository,
        IRepository<PharmacyInventoryItem> inventoryRepository,
        IRepository<PharmacySettings> settingsRepository,
        IRepository<DispenseAuditRecord> auditRepository,
        IUnitOfWork unitOfWork,
        IPharmacyScopeSetter scope,
        ILogger<OtcDispensationHandler> logger)
    {
        _orderRepository = orderRepository;
        _inventoryRepository = inventoryRepository;
        _settingsRepository = settingsRepository;
        _auditRepository = auditRepository;
        _unitOfWork = unitOfWork;
        _scope = scope;
        _logger = logger;
    }

    public async Task HandleAsync(PharmacyOtcDispensedPayload msg, InteropMessageContext context, CancellationToken ct)
    {
        var from = context.From;
        var to = context.To;

        if (to.Kind != PartyKind.Facility
            || to.FacilityType is not null and not FacilityType.Pharmacy
            || string.IsNullOrWhiteSpace(to.TenantId)
            || !Guid.TryParse(to.FacilityId, out var pharmacyId)
            || pharmacyId == Guid.Empty)
        {
            _logger.LogWarning(
                "[OtcDispensationHandler] Ignoring {MessageId}: recipient {Recipient} is not a pharmacy address.",
                context.MessageId, to.Address);
            return;
        }

        _scope.Enter(to.TenantId, pharmacyId);

        var settings = await _settingsRepository.Query(s => s.PharmacyId == pharmacyId).AsNoTracking().FirstOrDefaultAsync(ct);
        if (settings is null)
        {
            _logger.LogWarning(
                "[OtcDispensationHandler] Ignoring {MessageId}: {Recipient} is not a pharmacy provisioned on this server.",
                context.MessageId, to.Address);
            return;
        }

        var tenantId = to.TenantId;
        var pharmacyKey = pharmacyId.ToString();

        // Idempotency check: match by ExternalPrescriptionId == msg.InvoiceId
        var alreadyProcessed = await _orderRepository.Query(
                o => o.TenantId == tenantId
                     && o.PharmacyId == pharmacyKey
                     && o.ExternalPrescriptionId == msg.InvoiceId,
                ignoreQueryFilters: true)
            .AnyAsync(ct);

        if (alreadyProcessed)
        {
            _logger.LogInformation(
                "[OtcDispensationHandler] Invoice {InvoiceNo} ({InvoiceId}) already dispensed. Skipping duplicate event {EventId}.",
                msg.InvoiceNumber, msg.InvoiceId, msg.EventId);
            return;
        }

        var allDeductions = new List<object>();
        var orderItems = new List<PrescriptionOrderItem>();

        foreach (var item in msg.Items)
        {
            if (item.Quantity <= 0) continue;

            var inventoryItem = await _inventoryRepository.Query(i =>
                    (!string.IsNullOrEmpty(item.ItemCode) && (i.Sku == item.ItemCode || i.GenericName == item.ItemCode)) ||
                    i.GenericName == item.Description ||
                    i.BrandName == item.Description ||
                    i.Sku == item.Description)
                .Include(i => i.Batches)
                .FirstOrDefaultAsync(ct);

            if (inventoryItem == null)
            {
                _logger.LogWarning(
                    "[OtcDispensationHandler] Medication/Supply '{Description}' (Code: '{ItemCode}') not in inventory catalog. Skipping FEFO deduction.",
                    item.Description, item.ItemCode);

                orderItems.Add(new PrescriptionOrderItem
                {
                    GenericName = item.Description,
                    Dosage = !string.IsNullOrWhiteSpace(item.Category) ? item.Category : "OTC",
                    Sig = "As directed (OTC retail)",
                    QuantityPrescribed = item.Quantity,
                    QuantityDispensed = item.Quantity,
                    UnitPrice = item.UnitPrice,
                    Subtotal = item.TotalPrice,
                    Status = ItemDispenseStatus.Dispensed,
                    UpdatedAt = DateTime.UtcNow,
                    UpdatedBy = "OTC Cashier"
                });
                continue;
            }

            var candidateBatches = inventoryItem.Batches
                .Where(b => b.Status == BatchStatus.Active && b.QuantityRemaining > 0 && b.ExpiryDate > DateTime.UtcNow)
                .OrderBy(b => b.ExpiryDate)
                .ThenBy(b => b.ReceivedDate)
                .ToList();

            var fefoResult = FefoInventoryAllocator.Allocate(item.Quantity, candidateBatches);

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
                batch.UpdatedBy = "OTC Cashier";

                allocatedBatchesSummary.Add($"{batch.BatchNumber} (Qty: {alloc.QuantityAllocated})");
                earliestExpiry ??= batch.ExpiryDate;

                allDeductions.Add(new
                {
                    Drug = item.Description,
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
            inventoryItem.UpdatedBy = "OTC Cashier";

            orderItems.Add(new PrescriptionOrderItem
            {
                InventoryItemId = inventoryItem.Id,
                GenericName = item.Description,
                Dosage = !string.IsNullOrWhiteSpace(item.Category) ? item.Category : "OTC",
                Sig = "As directed (OTC retail)",
                QuantityPrescribed = item.Quantity,
                QuantityDispensed = item.Quantity,
                AllocatedBatchNumber = allocatedBatchesSummary.Count > 0 ? string.Join(", ", allocatedBatchesSummary) : null,
                AllocatedBatchExpiry = earliestExpiry,
                UnitPrice = item.UnitPrice,
                Subtotal = item.TotalPrice,
                Status = ItemDispenseStatus.Dispensed,
                UpdatedAt = DateTime.UtcNow,
                UpdatedBy = "OTC Cashier"
            });
        }

        var totalAmount = msg.Items.Sum(i => i.TotalPrice);

        var order = new PrescriptionOrder
        {
            TenantId = tenantId,
            PharmacyId = pharmacyKey,
            OrderingTenantId = !string.IsNullOrWhiteSpace(from.TenantId) ? from.TenantId : tenantId,
            OrderingFacilityId = !string.IsNullOrWhiteSpace(from.FacilityId) ? from.FacilityId : msg.ClinicId.ToString(),
            CorrelationId = context.CorrelationId != Guid.Empty ? context.CorrelationId : msg.InvoiceId,
            ExternalPrescriptionId = msg.InvoiceId,
            PrescriptionNumber = msg.InvoiceNumber,
            PharmacyName = settings.PharmacyName,
            OrderingFacilityName = "In-Clinic Cashier Station",
            OrderingDoctorName = "Cashier Station (OTC)",
            DoctorPrcLicense = "OTC",
            PatientName = "OTC / Retail Customer",
            Status = PrescriptionStatus.Dispensed,
            PaymentStatus = PrescriptionPaymentStatus.Paid,
            PaidAmount = totalAmount,
            QuotedAmount = totalAmount,
            TotalAmount = totalAmount,
            PaidAt = msg.DispensedAtUtc,
            DispensedAt = msg.DispensedAtUtc,
            PaymentReceiptNumber = msg.InvoiceNumber,
            StatusReason = "OTC / Retail Dispensation via In-Clinic Cashier",
            Items = orderItems
        };

        var auditRecord = new DispenseAuditRecord
        {
            PrescriptionOrderId = order.Id,
            PrescriptionOrder = order,
            PharmacistName = "Cashier Station (OTC)",
            PharmacistPrcLicense = "OTC",
            DispensedAt = msg.DispensedAtUtc,
            TotalAmount = totalAmount,
            ReceiptNumber = msg.InvoiceNumber,
            BatchDeductionsJson = JsonSerializer.Serialize(allDeductions),
            Notes = $"OTC Dispensation for Invoice {msg.InvoiceNumber} (Event: {msg.EventId})"
        };

        order.DispenseRecords.Add(auditRecord);

        await _orderRepository.AddAsync(order, ct);
        await _auditRepository.AddAsync(auditRecord, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation(
            "[OtcDispensationHandler] Successfully dispensed OTC items for invoice {InvoiceNo}. Total: {TotalAmount:C2}, Deductions: {Count}.",
            msg.InvoiceNumber, totalAmount, allDeductions.Count);
    }
}
