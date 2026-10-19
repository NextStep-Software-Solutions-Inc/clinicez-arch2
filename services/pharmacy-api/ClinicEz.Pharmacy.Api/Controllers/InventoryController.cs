using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Api.Authorization;
using ClinicEz.Pharmacy.Application.Features.Inventory.Commands;
using ClinicEz.Pharmacy.Application.Features.Inventory.DTOs;
using ClinicEz.Pharmacy.Application.Features.Inventory.Queries;
using ClinicEz.Pharmacy.Domain.Constants;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Pharmacy.Api.Controllers;

[ApiController]
[Route("api/v1/inventory")]
public sealed class InventoryController : ControllerBase
{
    private readonly ISender _sender;
    private readonly IPharmacyContext _context;

    public InventoryController(ISender sender, IPharmacyContext context)
    {
        _sender = sender;
        _context = context;
    }

    [HttpGet]
    [HasPermission(PharmacyPermissions.InventoryRead)]
    public async Task<ActionResult<ApiResponse<List<PharmacyInventoryItemDto>>>> GetInventory(
        [FromQuery] string? search,
        [FromQuery] bool? lowStockOnly,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetInventoryListQuery(search, lowStockOnly), ct);
        return Ok(ApiResponse<List<PharmacyInventoryItemDto>>.Success(result));
    }

    [HttpPost("batches")]
    [HasPermission(PharmacyPermissions.InventoryReceive)]
    public async Task<ActionResult<ApiResponse<PharmacyInventoryItemDto>>> AddBatch(
        [FromBody] AddInventoryBatchApiRequest request,
        CancellationToken ct = default)
    {
        var command = new AddInventoryBatchCommand(
            request.InventoryItemId,
            request.BatchNumber,
            request.ExpiryDate,
            request.QuantityReceived
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<PharmacyInventoryItemDto>.Success(result, "Inventory batch added successfully."));
    }

    [HttpPost("seed")]
    [HasPermission(PharmacyPermissions.InventoryManage)]
    public async Task<ActionResult<ApiResponse<int>>> SeedInventory(CancellationToken ct = default)
    {
        var count = await _sender.Send(new SeedInitialInventoryCommand(_context.PharmacyId.ToString(), _context.TenantId), ct);
        return Ok(ApiResponse<int>.Success(count, $"Pharmacy inventory initialized with {count} medications and FEFO batches."));
    }
}

public record AddInventoryBatchApiRequest
{
    public Guid InventoryItemId { get; init; }
    public required string BatchNumber { get; init; }
    public DateTime ExpiryDate { get; init; }
    public int QuantityReceived { get; init; }
}
