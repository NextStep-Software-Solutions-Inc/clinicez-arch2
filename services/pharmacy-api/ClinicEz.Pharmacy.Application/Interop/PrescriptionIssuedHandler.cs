using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Pharmacy.Application.Interop;

/// <summary>
/// <c>rx.issued</c>: a clinic sends a prescription to this pharmacy. The envelope's <c>To</c> must be a pharmacy provisioned
/// here (tenant + facility); the handler then runs inside that pharmacy's scope, so every query is tenant/pharmacy filtered.
/// The ordering party (the envelope's authenticated <c>From</c>) and correlation id are stored on the order so
/// <c>rx.dispensed</c> is addressed back to exactly that clinic. Idempotent per (ordering party, clinic prescription id).
/// </summary>
public sealed class PrescriptionIssuedHandler : IInteropHandler<PrescriptionIssuedEvent>
{
    private readonly IRepository<PrescriptionOrder> _orderRepository;
    private readonly IRepository<PharmacyInventoryItem> _inventoryRepository;
    private readonly IRepository<PharmacySettings> _settingsRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IPharmacyScopeSetter _scope;
    private readonly ILogger<PrescriptionIssuedHandler> _logger;

    public PrescriptionIssuedHandler(
        IRepository<PrescriptionOrder> orderRepository,
        IRepository<PharmacyInventoryItem> inventoryRepository,
        IRepository<PharmacySettings> settingsRepository,
        IUnitOfWork unitOfWork,
        IPharmacyScopeSetter scope,
        ILogger<PrescriptionIssuedHandler> logger)
    {
        _orderRepository = orderRepository;
        _inventoryRepository = inventoryRepository;
        _settingsRepository = settingsRepository;
        _unitOfWork = unitOfWork;
        _scope = scope;
        _logger = logger;
    }

    public async Task HandleAsync(PrescriptionIssuedEvent msg, InteropMessageContext context, CancellationToken ct)
    {
        var from = context.From;
        var to = context.To;

        if (from.Kind != PartyKind.Facility
            || string.IsNullOrWhiteSpace(from.TenantId)
            || string.IsNullOrWhiteSpace(from.FacilityId))
        {
            _logger.LogWarning(
                "[PrescriptionIssuedHandler] Ignoring {MessageId}: sender {Sender} is not an identifiable facility.",
                context.MessageId, from.Address);
            return;
        }

        if (to.Kind != PartyKind.Facility
            || to.FacilityType is not null and not FacilityType.Pharmacy
            || string.IsNullOrWhiteSpace(to.TenantId)
            || !Guid.TryParse(to.FacilityId, out var pharmacyId)
            || pharmacyId == Guid.Empty)
        {
            _logger.LogWarning(
                "[PrescriptionIssuedHandler] Ignoring {MessageId}: recipient {Recipient} is not a pharmacy address.",
                context.MessageId, to.Address);
            return;
        }

        _scope.Enter(to.TenantId, pharmacyId);

        // The scope filter on PharmacySettings makes this "is the addressed (tenant, pharmacy) provisioned here?".
        if (!await _settingsRepository.Query(s => s.PharmacyId == pharmacyId).AnyAsync(ct))
        {
            _logger.LogWarning(
                "[PrescriptionIssuedHandler] Ignoring {MessageId}: {Recipient} is not a pharmacy provisioned on this server.",
                context.MessageId, to.Address);
            return;
        }

        _logger.LogInformation(
            "[PrescriptionIssuedHandler] Received PrescriptionIssuedEvent: PrescriptionNo={PrescriptionNo}, Patient={PatientName}, Facility={FacilityName}",
            msg.PrescriptionNumber, msg.Patient.FullName, msg.OrderingFacilityName);

        var tenantId = to.TenantId;
        var pharmacyKey = pharmacyId.ToString();

        // Idempotency: one pharmacy prescription per (ordering clinic, clinic prescription id). Explicitly includes
        // soft-deleted rows (a redelivery must not re-create a removed order) and re-states the tenant/pharmacy scope.
        var alreadyIngested = await _orderRepository.Query(
                o => o.TenantId == tenantId
                     && o.PharmacyId == pharmacyKey
                     && o.OrderingTenantId == from.TenantId
                     && o.OrderingFacilityId == from.FacilityId
                     && o.ExternalPrescriptionId == msg.PrescriptionId,
                ignoreQueryFilters: true)
            .AnyAsync(ct);

        if (alreadyIngested)
        {
            _logger.LogInformation(
                "[PrescriptionIssuedHandler] Prescription {PrescriptionNo} already exists in PharmacyDb. Skipping insertion.",
                msg.PrescriptionNumber);
            return;
        }

        var order = new PrescriptionOrder
        {
            TenantId = tenantId,
            PharmacyId = pharmacyKey,
            OrderingTenantId = from.TenantId,
            OrderingFacilityId = from.FacilityId,
            CorrelationId = context.CorrelationId != Guid.Empty ? context.CorrelationId : msg.PrescriptionId,
            BranchId = msg.BranchId,
            ExternalPrescriptionId = msg.PrescriptionId,
            PrescriptionNumber = msg.PrescriptionNumber,
            OrderingFacilityName = msg.OrderingFacilityName,
            OrderingDoctorName = msg.PrescriberDoctor.DoctorName,
            DoctorPrcLicense = msg.PrescriberDoctor.PrcLicenseNumber,
            DoctorPtr = msg.PrescriberDoctor.PtrNumber,
            DoctorS2License = msg.PrescriberDoctor.S2LicenseNumber,
            PatientId = msg.Patient.PatientId,
            PatientName = msg.Patient.FullName,
            PatientAge = msg.Patient.Age,
            PatientGender = string.IsNullOrWhiteSpace(msg.Patient.Gender) ? "Unknown" : msg.Patient.Gender,
            PatientContact = msg.Patient.ContactNumber,
            PatientAllergies = msg.Patient.Allergies,
            ClinicalDiagnosis = msg.ClinicalDiagnosis,
            SpecialInstructions = msg.SpecialInstructions,
            Status = PrescriptionStatus.Pending,
            IssuedAt = msg.IssuedAt,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "SystemInterop"
        };

        decimal calculatedTotal = 0m;

        foreach (var item in msg.Items)
        {
            var searchName = item.GenericName.ToLower();
            var matchedInventory = await _inventoryRepository.Query(i =>
                i.GenericName.ToLower().Contains(searchName))
                .FirstOrDefaultAsync(ct);

            var unitPrice = matchedInventory?.UnitPrice ?? 10.00m;
            var subtotal = unitPrice * item.Quantity;
            calculatedTotal += subtotal;

            order.Items.Add(new PrescriptionOrderItem
            {
                Id = Guid.NewGuid(),
                InventoryItemId = matchedInventory?.Id,
                GenericName = item.GenericName,
                BrandName = item.BrandName ?? matchedInventory?.BrandName,
                Dosage = item.Dosage,
                Form = !string.IsNullOrWhiteSpace(item.Form) ? item.Form : (matchedInventory?.DosageForm ?? "Tablet"),
                Sig = item.Sig,
                QuantityPrescribed = item.Quantity,
                QuantityDispensed = 0,
                UnitPrice = unitPrice,
                Subtotal = subtotal,
                Status = ItemDispenseStatus.Pending,
                IsDangerousDrug = item.IsDangerousDrug,
                Remarks = item.Remarks
            });
        }

        order.TotalAmount = calculatedTotal;

        await _orderRepository.AddAsync(order, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation(
            "[PrescriptionIssuedHandler] Successfully ingested Prescription {PrescriptionNo} with {ItemCount} item(s) into Pharmacy dispensing queue.",
            order.PrescriptionNumber, order.Items.Count);
    }
}
