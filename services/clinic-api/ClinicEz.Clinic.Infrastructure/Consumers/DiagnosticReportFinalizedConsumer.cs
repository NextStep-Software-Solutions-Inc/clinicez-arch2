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

public class DiagnosticReportFinalizedConsumer : IConsumer<DiagnosticReportFinalizedEvent>
{
    private readonly IRepository<ClinicLabOrder> _orderRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<DiagnosticReportFinalizedConsumer> _logger;

    public DiagnosticReportFinalizedConsumer(
        IRepository<ClinicLabOrder> orderRepo,
        IUnitOfWork unitOfWork,
        ILogger<DiagnosticReportFinalizedConsumer> logger)
    {
        _orderRepo = orderRepo;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task Consume(ConsumeContext<DiagnosticReportFinalizedEvent> context)
    {
        var message = context.Message;
        _logger.LogInformation("[ClinicEz.Clinic] Ingesting DiagnosticReportFinalizedEvent for Accession #{AccessionNumber} from Lab {LabName}",
            message.AccessionNumber, message.LaboratoryName);

        var order = await _orderRepo.Query(o => o.Id == message.RequisitionId || o.OrderNumber == message.AccessionNumber)
            .Include(o => o.Items)
            .FirstOrDefaultAsync(context.CancellationToken);

        if (order == null)
        {
            _logger.LogWarning("[ClinicEz.Clinic] Lab order #{AccessionNumber} (ID: {RequisitionId}) not found in ClinicDb. Skipping.",
                message.AccessionNumber, message.RequisitionId);
            return;
        }

        order.ExternalLabName = message.LaboratoryName;
        order.ExternalReportType = "DigitalDiagnosticReport";
        order.ObservationsJson = JsonSerializer.Serialize(message.Observations);
        order.PathologistImpression = message.PathologistImpression;
        order.VerifiedByPathologist = message.PathologistName;
        order.PathologistPrcLicense = message.PathologistPrcLicense;
        order.ExternalReportFileBase64 = message.SignedPdfBase64;
        order.ReportReleasedAt = message.ReleasedAt;
        order.Status = LabOrderStatus.ResultsReceived;

        foreach (var item in order.Items)
        {
            item.Status = LabOrderStatus.ResultsReceived;
        }

        _orderRepo.Update(order);
        await _unitOfWork.SaveChangesAsync(context.CancellationToken);

        _logger.LogInformation("[ClinicEz.Clinic] Successfully attached verified lab results to patient EMR for order #{AccessionNumber}",
            message.AccessionNumber);
    }
}
