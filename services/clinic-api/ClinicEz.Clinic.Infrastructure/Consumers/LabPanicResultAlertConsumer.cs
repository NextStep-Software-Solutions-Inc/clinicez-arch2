using System;
using System.Text.Json;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Interoperability;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Consumers;

public class LabPanicResultAlertConsumer : IConsumer<LabPanicResultAlertEvent>
{
    private readonly IRepository<ClinicLabOrder> _orderRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<LabPanicResultAlertConsumer> _logger;

    public LabPanicResultAlertConsumer(
        IRepository<ClinicLabOrder> orderRepo,
        IUnitOfWork unitOfWork,
        ILogger<LabPanicResultAlertConsumer> logger)
    {
        _orderRepo = orderRepo;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task Consume(ConsumeContext<LabPanicResultAlertEvent> context)
    {
        var message = context.Message;
        _logger.LogWarning(
            "[ClinicEz.Clinic] 🚨 STAT CRITICAL PANIC ALERT received for Patient {PatientName} (Accession #{AccessionNumber}). TriggeredAt: {TriggeredAt}",
            message.PatientName, message.AccessionNumber, message.TriggeredAt);

        var order = await _orderRepo.Query(o => o.Id == message.RequisitionId || o.OrderNumber == message.AccessionNumber)
            .FirstOrDefaultAsync(context.CancellationToken);

        var findingsJson = JsonSerializer.Serialize(message.CriticalFindings);

        if (order != null)
        {
            order.HasCriticalPanicAlert = true;
            order.CriticalFindingsJson = findingsJson;
            order.PanicAlertTriggeredAt = message.TriggeredAt;
            _orderRepo.Update(order);
        }
        else
        {
            _logger.LogInformation(
                "[ClinicEz.Clinic] Order #{AccessionNumber} not pre-existing in clinic. Creating inbound STAT lab order.",
                message.AccessionNumber);

            var newOrder = new ClinicLabOrder
            {
                Id = message.RequisitionId != Guid.Empty ? message.RequisitionId : Guid.NewGuid(),
                OrderNumber = string.IsNullOrWhiteSpace(message.AccessionNumber) ? $"ACC-{DateTime.UtcNow.Ticks % 1000000:D6}" : message.AccessionNumber,
                PatientId = message.PatientId,
                PatientName = message.PatientName,
                OrderedByDoctorName = message.OrderingDoctorName,
                ExternalLabName = message.OrderingFacilityName,
                Status = LabOrderStatus.ResultsReceived,
                HasCriticalPanicAlert = true,
                CriticalFindingsJson = findingsJson,
                PanicAlertTriggeredAt = message.TriggeredAt,
                Notes = $"STAT Panic finding automatically routed from LIS ({message.OrderingFacilityName})."
            };

            await _orderRepo.AddAsync(newOrder, context.CancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(context.CancellationToken);

        _logger.LogInformation(
            "[ClinicEz.Clinic] Successfully registered STAT critical panic alert for Accession #{AccessionNumber}",
            message.AccessionNumber);
    }
}
