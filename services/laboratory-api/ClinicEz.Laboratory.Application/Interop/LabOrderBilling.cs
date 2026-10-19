using System.Text.Json;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Laboratory.Application.Interop;

/// <inheritdoc cref="ILabOrderBilling"/>
public sealed class LabOrderBilling : ILabOrderBilling
{
    public const string LabOrderSourceType = "LabOrder";

    private readonly IInteropPublisher _publisher;
    private readonly IRepository<Product> _productRepository;
    private readonly ILogger<LabOrderBilling> _logger;

    public LabOrderBilling(
        IInteropPublisher publisher,
        IRepository<Product> productRepository,
        ILogger<LabOrderBilling> logger)
    {
        _publisher = publisher;
        _productRepository = productRepository;
        _logger = logger;
    }

    public async Task RequestInvoiceAsync(LabRequisition requisition, IReadOnlyCollection<RequisitionItemDto> items, CancellationToken ct)
    {
        if (requisition.PaymentPolicy == PaymentPolicy.None)
        {
            return;
        }

        var requested = items
            .Select(i => (Code: string.IsNullOrWhiteSpace(i.ItemCode) ? i.ItemName : i.ItemCode, Name: i.ItemName))
            .ToList();

        var lines = await PriceAsync(requested, ct);
        Enqueue(requisition, lines);
    }

    public async Task<bool> RefreshInvoiceAsync(LabRequisition requisition, CancellationToken ct)
    {
        if (requisition.PaymentPolicy == PaymentPolicy.None
            || requisition.PaidAtUtc != null
            || string.IsNullOrWhiteSpace(requisition.QuoteLinesJson))
        {
            return false;
        }

        var stored = JsonSerializer.Deserialize<List<BillingLineDto>>(requisition.QuoteLinesJson, InteropJson.Options) ?? new List<BillingLineDto>();
        var lines = await PriceAsync(stored.Select(l => (l.Code, l.Description)).ToList(), ct);
        Enqueue(requisition, lines);
        return true;
    }

    private async Task<List<BillingLineDto>> PriceAsync(IReadOnlyList<(string Code, string Name)> requested, CancellationToken ct)
    {
        var codes = requested.Select(r => r.Code.Trim().ToUpperInvariant()).Distinct().ToList();

        // The catalogue is the laboratory's own: the product query filter limits it to the active tenant and laboratory.
        var products = await _productRepository.Query()
            .AsNoTracking()
            .Where(p => !p.IsDeleted && codes.Contains(p.Sku.ToUpper()))
            .ToListAsync(ct);

        var priceByCode = products
            .GroupBy(p => p.Sku.Trim().ToUpperInvariant())
            .ToDictionary(g => g.Key, g => g.First().Price);

        var lines = new List<BillingLineDto>();
        foreach (var (code, name) in requested)
        {
            if (!priceByCode.TryGetValue(code.Trim().ToUpperInvariant(), out var price))
            {
                _logger.LogWarning(
                    "[LabOrderBilling] Test {Code} ('{Name}') is not in this laboratory's catalogue; it is billed at 0 so the cashier can price it.",
                    code, name);
                price = 0m;
            }

            lines.Add(new BillingLineDto { Code = code, Description = name, Quantity = 1, UnitPrice = price });
        }

        return lines;
    }

    private void Enqueue(LabRequisition requisition, List<BillingLineDto> lines)
    {
        requisition.QuotedAmount = lines.Sum(l => l.UnitPrice * l.Quantity);
        requisition.QuoteLinesJson = JsonSerializer.Serialize(lines, InteropJson.Options);

        var payload = new BillingInvoiceRequestedPayload
        {
            InvoiceRequestId = requisition.Id,
            TenantId = requisition.TenantId,
            FacilityId = requisition.LaboratoryId.ToString(),
            FacilityType = FacilityType.Laboratory,
            BranchId = requisition.BranchId,
            PatientId = requisition.HasClinicEzPatient ? requisition.PatientId : null,
            PatientName = requisition.PatientName,
            VisitKey = requisition.VisitKey,
            SourceType = LabOrderSourceType,
            SourceId = requisition.ClinicRequisitionId,
            Lines = lines,
            Currency = requisition.Currency
        };

        _publisher.Enqueue(
            InteropTypes.BillingInvoiceRequested,
            LabInteropParties.Laboratory(requisition.TenantId, requisition.LaboratoryId.ToString()),
            Party.ForFacility(requisition.TenantId, requisition.LaboratoryId.ToString(), FacilityType.Laboratory, InteropServices.Billing),
            requisition.Id,
            payload);
    }
}
