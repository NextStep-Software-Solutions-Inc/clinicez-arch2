using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Pharmacy.Application.Features.Inventory.Commands;

public record SeedInitialInventoryCommand(string PharmacyId, string TenantId) : IRequest<int>;

public class SeedInitialInventoryCommandHandler : IRequestHandler<SeedInitialInventoryCommand, int>
{
    private readonly IRepository<PharmacyInventoryItem> _inventoryRepo;
    private readonly IUnitOfWork _unitOfWork;

    public SeedInitialInventoryCommandHandler(
        IRepository<PharmacyInventoryItem> inventoryRepo,
        IUnitOfWork unitOfWork)
    {
        _inventoryRepo = inventoryRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<int> Handle(SeedInitialInventoryCommand request, CancellationToken cancellationToken)
    {
        var existingCount = await _inventoryRepo.Query().CountAsync(cancellationToken);
        if (existingCount > 0)
        {
            return existingCount;
        }

        var now = DateTime.UtcNow;

        var items = new List<PharmacyInventoryItem>
        {
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = request.TenantId,
                PharmacyId = request.PharmacyId,
                Sku = "MED-001",
                GenericName = "Amlodipine Besylate",
                BrandName = "Norvasc",
                DosageForm = "Tablet",
                Strength = "5mg",
                CurrentStock = 450,
                ReorderLevel = 100,
                UnitCost = 4.50m,
                UnitPrice = 8.50m,
                StorageCondition = "Store below 30°C",
                Batches = new List<InventoryBatch>
                {
                    new()
                    {
                        Id = Guid.NewGuid(),
                        TenantId = request.TenantId,
                        PharmacyId = request.PharmacyId,
                        BatchNumber = "B-AML-2026-03",
                        ExpiryDate = now.AddMonths(14), // Earlier expiry
                        QuantityReceived = 200,
                        QuantityRemaining = 150,
                        ReceivedDate = now.AddMonths(-2),
                        Status = BatchStatus.Active
                    },
                    new()
                    {
                        Id = Guid.NewGuid(),
                        TenantId = request.TenantId,
                        PharmacyId = request.PharmacyId,
                        BatchNumber = "B-AML-2026-08",
                        ExpiryDate = now.AddMonths(22), // Later expiry
                        QuantityReceived = 300,
                        QuantityRemaining = 300,
                        ReceivedDate = now.AddDays(-10),
                        Status = BatchStatus.Active
                    }
                }
            },
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = request.TenantId,
                PharmacyId = request.PharmacyId,
                Sku = "MED-002",
                GenericName = "Losartan Potassium",
                BrandName = "Cozaar",
                DosageForm = "Tablet",
                Strength = "50mg",
                CurrentStock = 320,
                ReorderLevel = 100,
                UnitCost = 6.20m,
                UnitPrice = 12.00m,
                StorageCondition = "Store below 30°C",
                Batches = new List<InventoryBatch>
                {
                    new()
                    {
                        Id = Guid.NewGuid(),
                        TenantId = request.TenantId,
                        PharmacyId = request.PharmacyId,
                        BatchNumber = "B-LOS-2026-04",
                        ExpiryDate = now.AddMonths(12),
                        QuantityReceived = 150,
                        QuantityRemaining = 120,
                        ReceivedDate = now.AddMonths(-3),
                        Status = BatchStatus.Active
                    },
                    new()
                    {
                        Id = Guid.NewGuid(),
                        TenantId = request.TenantId,
                        PharmacyId = request.PharmacyId,
                        BatchNumber = "B-LOS-2026-09",
                        ExpiryDate = now.AddMonths(24),
                        QuantityReceived = 200,
                        QuantityRemaining = 200,
                        ReceivedDate = now.AddDays(-5),
                        Status = BatchStatus.Active
                    }
                }
            },
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = request.TenantId,
                PharmacyId = request.PharmacyId,
                Sku = "MED-003",
                GenericName = "Co-Amoxiclav",
                BrandName = "Augmentin",
                DosageForm = "Tablet",
                Strength = "625mg",
                CurrentStock = 45, // Below reorder level (Low Stock)
                ReorderLevel = 50,
                UnitCost = 18.00m,
                UnitPrice = 28.00m,
                StorageCondition = "Store in a dry place below 25°C",
                Batches = new List<InventoryBatch>
                {
                    new()
                    {
                        Id = Guid.NewGuid(),
                        TenantId = request.TenantId,
                        PharmacyId = request.PharmacyId,
                        BatchNumber = "B-AMX-2026-01",
                        ExpiryDate = now.AddMonths(6),
                        QuantityReceived = 100,
                        QuantityRemaining = 45,
                        ReceivedDate = now.AddMonths(-5),
                        Status = BatchStatus.Active
                    }
                }
            },
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = request.TenantId,
                PharmacyId = request.PharmacyId,
                Sku = "MED-004",
                GenericName = "Metformin HCl",
                BrandName = "Glucophage",
                DosageForm = "Tablet",
                Strength = "500mg",
                CurrentStock = 680,
                ReorderLevel = 150,
                UnitCost = 3.00m,
                UnitPrice = 6.25m,
                StorageCondition = "Store below 30°C",
                Batches = new List<InventoryBatch>
                {
                    new()
                    {
                        Id = Guid.NewGuid(),
                        TenantId = request.TenantId,
                        PharmacyId = request.PharmacyId,
                        BatchNumber = "B-MET-2026-02",
                        ExpiryDate = now.AddMonths(15),
                        QuantityReceived = 400,
                        QuantityRemaining = 280,
                        ReceivedDate = now.AddMonths(-4),
                        Status = BatchStatus.Active
                    },
                    new()
                    {
                        Id = Guid.NewGuid(),
                        TenantId = request.TenantId,
                        PharmacyId = request.PharmacyId,
                        BatchNumber = "B-MET-2026-07",
                        ExpiryDate = now.AddMonths(26),
                        QuantityReceived = 400,
                        QuantityRemaining = 400,
                        ReceivedDate = now.AddDays(-15),
                        Status = BatchStatus.Active
                    }
                }
            },
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = request.TenantId,
                PharmacyId = request.PharmacyId,
                Sku = "MED-005",
                GenericName = "Paracetamol",
                BrandName = "Biogesic",
                DosageForm = "Tablet",
                Strength = "500mg",
                CurrentStock = 1200,
                ReorderLevel = 300,
                UnitCost = 1.50m,
                UnitPrice = 3.50m,
                StorageCondition = "Store below 30°C",
                Batches = new List<InventoryBatch>
                {
                    new()
                    {
                        Id = Guid.NewGuid(),
                        TenantId = request.TenantId,
                        PharmacyId = request.PharmacyId,
                        BatchNumber = "B-PCM-2026-05",
                        ExpiryDate = now.AddMonths(18),
                        QuantityReceived = 1200,
                        QuantityRemaining = 1200,
                        ReceivedDate = now.AddMonths(-1),
                        Status = BatchStatus.Active
                    }
                }
            },
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = request.TenantId,
                PharmacyId = request.PharmacyId,
                Sku = "MED-006",
                GenericName = "Clopidogrel",
                BrandName = "Plavix",
                DosageForm = "Tablet",
                Strength = "75mg",
                CurrentStock = 240,
                ReorderLevel = 50,
                UnitCost = 12.00m,
                UnitPrice = 22.50m,
                StorageCondition = "Store below 30°C",
                Batches = new List<InventoryBatch>
                {
                    new()
                    {
                        Id = Guid.NewGuid(),
                        TenantId = request.TenantId,
                        PharmacyId = request.PharmacyId,
                        BatchNumber = "B-CLP-2026-06",
                        ExpiryDate = now.AddMonths(16),
                        QuantityReceived = 240,
                        QuantityRemaining = 240,
                        ReceivedDate = now.AddMonths(-2),
                        Status = BatchStatus.Active
                    }
                }
            },
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = request.TenantId,
                PharmacyId = request.PharmacyId,
                Sku = "MED-007",
                GenericName = "Atorvastatin Calcium",
                BrandName = "Lipitor",
                DosageForm = "Tablet",
                Strength = "20mg",
                CurrentStock = 180,
                ReorderLevel = 50,
                UnitCost = 11.50m,
                UnitPrice = 21.00m,
                StorageCondition = "Store below 30°C",
                Batches = new List<InventoryBatch>
                {
                    new()
                    {
                        Id = Guid.NewGuid(),
                        TenantId = request.TenantId,
                        PharmacyId = request.PharmacyId,
                        BatchNumber = "B-ATV-2026-07",
                        ExpiryDate = now.AddMonths(14),
                        QuantityReceived = 180,
                        QuantityRemaining = 180,
                        ReceivedDate = now.AddMonths(-1),
                        Status = BatchStatus.Active
                    }
                }
            }
        };

        foreach (var item in items)
        {
            await _inventoryRepo.AddAsync(item, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return items.Count;
    }
}
