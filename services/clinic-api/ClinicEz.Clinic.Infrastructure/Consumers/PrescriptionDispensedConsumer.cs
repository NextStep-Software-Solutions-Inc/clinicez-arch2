using System;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Interoperability;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Consumers;

public class PrescriptionDispensedConsumer : IConsumer<PrescriptionDispensedEvent>
{
    private readonly IRepository<ConsultationEncounter> _encounterRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<PrescriptionDispensedConsumer> _logger;

    public PrescriptionDispensedConsumer(
        IRepository<ConsultationEncounter> encounterRepo,
        IUnitOfWork unitOfWork,
        ILogger<PrescriptionDispensedConsumer> logger)
    {
        _encounterRepo = encounterRepo;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task Consume(ConsumeContext<PrescriptionDispensedEvent> context)
    {
        var message = context.Message;
        _logger.LogInformation("[ClinicEz.Clinic] Ingesting PrescriptionDispensedEvent for Prescription #{PrescriptionNo} from Pharmacy {PharmacyName}",
            message.PrescriptionNumber, message.PharmacyFacilityName);

        var encounter = await _encounterRepo.Query(e =>
            e.Id == message.PrescriptionId ||
            e.PrescriptionNumber == message.PrescriptionNumber)
            .Include(e => e.Prescriptions)
            .FirstOrDefaultAsync(context.CancellationToken);

        if (encounter == null)
        {
            _logger.LogWarning("[ClinicEz.Clinic] Consultation encounter for prescription #{PrescriptionNo} not found in ClinicDb. Skipping.",
                message.PrescriptionNumber);
            return;
        }

        encounter.RxDispenseStatus = PrescriptionDispenseStatus.DispensedAtPartnerPharmacy;
        encounter.RxDispensedPharmacyName = message.PharmacyFacilityName;
        encounter.RxDispensedPharmacistName = message.DispensingPharmacistName;
        encounter.RxDispensedPharmacistPrc = message.DispensingPharmacistPrcLicense;
        encounter.RxDispensedReceiptNumber = message.ReceiptNumber;
        encounter.RxDispensedAt = message.DispensedAt;
        encounter.RxNotes = $"Dispensed ₱{message.TotalAmount:N2}. {message.Notes}".Trim();
        encounter.UpdatedAt = DateTime.UtcNow;

        _encounterRepo.Update(encounter);
        await _unitOfWork.SaveChangesAsync(context.CancellationToken);

        _logger.LogInformation("[ClinicEz.Clinic] Successfully updated EMR with partner pharmacy dispense record for Prescription #{PrescriptionNo}",
            message.PrescriptionNumber);
    }
}
