using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Application.Features.Inventory.DTOs;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Pharmacy.Application.Features.Inventory.Queries;

public record GetInventoryListQuery(
    string? Search = null,
    bool? LowStockOnly = null
) : IRequest<List<PharmacyInventoryItemDto>>;

public class GetInventoryListQueryHandler : IRequestHandler<GetInventoryListQuery, List<PharmacyInventoryItemDto>>
{
    private readonly IRepository<PharmacyInventoryItem> _inventoryRepo;

    public GetInventoryListQueryHandler(IRepository<PharmacyInventoryItem> inventoryRepo)
    {
        _inventoryRepo = inventoryRepo;
    }

    public async Task<List<PharmacyInventoryItemDto>> Handle(GetInventoryListQuery request, CancellationToken cancellationToken)
    {
        var query = _inventoryRepo.Query()
            .Include(i => i.Batches)
            .AsNoTracking();

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim().ToLower();
            query = query.Where(i =>
                i.Sku.ToLower().Contains(search) ||
                i.GenericName.ToLower().Contains(search) ||
                (i.BrandName != null && i.BrandName.ToLower().Contains(search)));
        }

        var items = await query
            .OrderBy(i => i.GenericName)
            .ToListAsync(cancellationToken);

        if (request.LowStockOnly == true)
        {
            items = items.Where(i => i.CurrentStock <= i.ReorderLevel).ToList();
        }

        return items.Select(i => new PharmacyInventoryItemDto(
            i.Id,
            i.Sku,
            i.GenericName,
            i.BrandName,
            i.DosageForm,
            i.Strength,
            i.CurrentStock,
            i.ReorderLevel,
            i.UnitCost,
            i.UnitPrice,
            i.StorageCondition,
            i.IsDangerousDrug,
            i.CurrentStock <= i.ReorderLevel,
            i.Batches.OrderBy(b => b.ExpiryDate).Select(b => new InventoryBatchDto(
                b.Id,
                b.BatchNumber,
                b.ExpiryDate,
                b.QuantityReceived,
                b.QuantityRemaining,
                b.ReceivedDate,
                b.Status.ToString()
            )).ToList()
        )).ToList();
    }
}
