using System;
using System.Linq;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Interoperability;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Pharmacy.Infrastructure.Consumers;

public class PrescriptionIssuedConsumer : IConsumer<PrescriptionIssuedEvent>
{
    private readonly IRepository<PrescriptionOrder> _orderRepository;
    private readonly IRepository<PharmacyInventoryItem> _inventoryRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<PrescriptionIssuedConsumer> _logger;

    public PrescriptionIssuedConsumer(
        IRepository<PrescriptionOrder> orderRepository,
        IRepository<PharmacyInventoryItem> inventoryRepository,
        IUnitOfWork unitOfWork,
        ILogger<PrescriptionIssuedConsumer> logger)
    {
        _orderRepository = orderRepository;
        _inventoryRepository = inventoryRepository;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task Consume(ConsumeContext<PrescriptionIssuedEvent> context)
    {
        var msg = context.Message;
        _logger.LogInformation(
            "[PrescriptionIssuedConsumer] Received PrescriptionIssuedEvent: PrescriptionNo={PrescriptionNo}, Patient={PatientName}, Facility={FacilityName}",
            msg.PrescriptionNumber, msg.Patient.FullName, msg.OrderingFacilityName);

        // Check idempotency
        var existing = await _orderRepository.FindAsync(
            p => p.ExternalPrescriptionId == msg.PrescriptionId || p.PrescriptionNumber == msg.PrescriptionNumber,
            context.CancellationToken);

        if (existing != null)
        {
            _logger.LogInformation(
                "[PrescriptionIssuedConsumer] Prescription {PrescriptionNo} already exists in PharmacyDb. Skipping insertion.",
                msg.PrescriptionNumber);
            return;
        }

        var order = new PrescriptionOrder
        {
            TenantId = !string.IsNullOrWhiteSpace(msg.TargetPharmacyTenantId) ? msg.TargetPharmacyTenantId : (!string.IsNullOrWhiteSpace(msg.TenantId) ? msg.TenantId : "default"),
            PharmacyId = !string.IsNullOrWhiteSpace(msg.TargetPharmacyFacilityId) ? msg.TargetPharmacyFacilityId : "pharmacy-main",
            ExternalPrescriptionId = msg.PrescriptionId,
            PrescriptionNumber = msg.PrescriptionNumber,
            OrderingFacilityId = msg.OrderingFacilityId,
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
            IssuedAt = msg.IssuedAt
        };

        decimal calculatedTotal = 0m;

        foreach (var item in msg.Items)
        {
            var searchName = item.GenericName.ToLower();
            var matchedInventory = await _inventoryRepository.Query(i =>
                i.GenericName.ToLower().Contains(searchName))
                .FirstOrDefaultAsync(context.CancellationToken);

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

        await _orderRepository.AddAsync(order, context.CancellationToken);
        await _unitOfWork.SaveChangesAsync(context.CancellationToken);

        _logger.LogInformation(
            "[PrescriptionIssuedConsumer] Successfully ingested Prescription {PrescriptionNo} with {ItemCount} item(s) into Pharmacy dispensing queue.",
            order.PrescriptionNumber, order.Items.Count);
    }
}
