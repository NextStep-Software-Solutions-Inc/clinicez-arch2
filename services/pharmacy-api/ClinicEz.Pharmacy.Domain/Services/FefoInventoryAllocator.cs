using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;

namespace ClinicEz.Pharmacy.Domain.Services;

public record BatchAllocationDetail(
    Guid BatchId,
    string BatchNumber,
    DateTime ExpiryDate,
    int QuantityAllocated,
    int RemainingAfterDeduction
);

public record FefoAllocationResult(
    bool IsFullyAllocated,
    int RequestedQuantity,
    int AllocatedQuantity,
    int Shortage,
    List<BatchAllocationDetail> Allocations
);

public static class FefoInventoryAllocator
{
    /// <summary>
    /// Implements First-Expired, First-Out (FEFO) batch allocation.
    /// Filters out expired batches (ExpiryDate <= currentDate) and depleted batches,
    /// sorting candidate batches by earliest expiration date first.
    /// </summary>
    public static FefoAllocationResult Allocate(
        int requestedQuantity,
        IEnumerable<InventoryBatch> candidateBatches,
        DateTime? asOfDate = null)
    {
        if (requestedQuantity <= 0)
        {
            return new FefoAllocationResult(
                IsFullyAllocated: true,
                RequestedQuantity: 0,
                AllocatedQuantity: 0,
                Shortage: 0,
                Allocations: new List<BatchAllocationDetail>()
            );
        }

        var evaluationDate = (asOfDate ?? DateTime.UtcNow).Date;

        // FEFO Selection: Active, not depleted, not expired, ordered by ExpiryDate ASC
        var eligibleBatches = candidateBatches
            .Where(b => b.Status == BatchStatus.Active &&
                        b.QuantityRemaining > 0 &&
                        b.ExpiryDate.Date > evaluationDate)
            .OrderBy(b => b.ExpiryDate)
            .ThenBy(b => b.ReceivedDate)
            .ToList();

        var allocations = new List<BatchAllocationDetail>();
        var remainingNeeded = requestedQuantity;

        foreach (var batch in eligibleBatches)
        {
            if (remainingNeeded <= 0) break;

            var take = Math.Min(batch.QuantityRemaining, remainingNeeded);
            var remaining = batch.QuantityRemaining - take;

            allocations.Add(new BatchAllocationDetail(
                BatchId: batch.Id,
                BatchNumber: batch.BatchNumber,
                ExpiryDate: batch.ExpiryDate,
                QuantityAllocated: take,
                RemainingAfterDeduction: remaining
            ));

            remainingNeeded -= take;
        }

        var totalAllocated = requestedQuantity - remainingNeeded;
        var isFullyAllocated = remainingNeeded == 0;

        return new FefoAllocationResult(
            IsFullyAllocated: isFullyAllocated,
            RequestedQuantity: requestedQuantity,
            AllocatedQuantity: totalAllocated,
            Shortage: remainingNeeded,
            Allocations: allocations
        );
    }
}
