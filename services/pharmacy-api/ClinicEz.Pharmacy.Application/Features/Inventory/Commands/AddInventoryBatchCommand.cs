using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Application.Features.Inventory.DTOs;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Pharmacy.Application.Features.Inventory.Commands;

public record AddInventoryBatchCommand(
    Guid InventoryItemId,
    string BatchNumber,
    DateTime ExpiryDate,
    int QuantityReceived
) : IRequest<PharmacyInventoryItemDto>;

public class AddInventoryBatchCommandValidator : AbstractValidator<AddInventoryBatchCommand>
{
    public AddInventoryBatchCommandValidator()
    {
        RuleFor(x => x.InventoryItemId).NotEmpty();
        RuleFor(x => x.BatchNumber).NotEmpty().MaximumLength(100);
        RuleFor(x => x.ExpiryDate).GreaterThan(DateTime.UtcNow).WithMessage("Batch expiration date must be in the future.");
        RuleFor(x => x.QuantityReceived).GreaterThan(0);
    }
}

public class AddInventoryBatchCommandHandler : IRequestHandler<AddInventoryBatchCommand, PharmacyInventoryItemDto>
{
    private readonly IRepository<PharmacyInventoryItem> _inventoryRepo;
    private readonly IRepository<InventoryBatch> _batchRepo;
    private readonly IUnitOfWork _unitOfWork;

    public AddInventoryBatchCommandHandler(
        IRepository<PharmacyInventoryItem> inventoryRepo,
        IRepository<InventoryBatch> batchRepo,
        IUnitOfWork unitOfWork)
    {
        _inventoryRepo = inventoryRepo;
        _batchRepo = batchRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<PharmacyInventoryItemDto> Handle(AddInventoryBatchCommand request, CancellationToken cancellationToken)
    {
        var item = await _inventoryRepo.Query(i => i.Id == request.InventoryItemId)
            .Include(i => i.Batches)
            .FirstOrDefaultAsync(cancellationToken);

        if (item == null)
        {
            throw new NotFoundException($"Inventory item with ID '{request.InventoryItemId}' was not found.");
        }

        var batch = new InventoryBatch
        {
            Id = Guid.NewGuid(),
            TenantId = item.TenantId,
            PharmacyId = item.PharmacyId,
            InventoryItemId = item.Id,
            BatchNumber = request.BatchNumber.Trim(),
            ExpiryDate = request.ExpiryDate,
            QuantityReceived = request.QuantityReceived,
            QuantityRemaining = request.QuantityReceived,
            ReceivedDate = DateTime.UtcNow,
            Status = BatchStatus.Active,
            CreatedAt = DateTime.UtcNow
        };

        item.Batches.Add(batch);
        item.CurrentStock = item.Batches
            .Where(b => b.Status == BatchStatus.Active && b.ExpiryDate > DateTime.UtcNow)
            .Sum(b => b.QuantityRemaining);
        item.UpdatedAt = DateTime.UtcNow;

        await _batchRepo.AddAsync(batch, cancellationToken);
        _inventoryRepo.Update(item);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new PharmacyInventoryItemDto(
            item.Id,
            item.Sku,
            item.GenericName,
            item.BrandName,
            item.DosageForm,
            item.Strength,
            item.CurrentStock,
            item.ReorderLevel,
            item.UnitCost,
            item.UnitPrice,
            item.StorageCondition,
            item.IsDangerousDrug,
            item.CurrentStock <= item.ReorderLevel,
            item.Batches.OrderBy(b => b.ExpiryDate).Select(b => new InventoryBatchDto(
                b.Id,
                b.BatchNumber,
                b.ExpiryDate,
                b.QuantityReceived,
                b.QuantityRemaining,
                b.ReceivedDate,
                b.Status.ToString()
            )).ToList()
        );
    }
}
