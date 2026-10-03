using System;
using System.Collections.Generic;

namespace ClinicEz.Pharmacy.Application.Features.Inventory.DTOs;

public record InventoryBatchDto(
    Guid Id,
    string BatchNumber,
    DateTime ExpiryDate,
    int QuantityReceived,
    int QuantityRemaining,
    DateTime ReceivedDate,
    string Status
);

public record PharmacyInventoryItemDto(
    Guid Id,
    string Sku,
    string GenericName,
    string? BrandName,
    string DosageForm,
    string Strength,
    int CurrentStock,
    int ReorderLevel,
    decimal UnitCost,
    decimal UnitPrice,
    string? StorageCondition,
    bool IsDangerousDrug,
    bool IsLowStock,
    List<InventoryBatchDto> Batches
);
