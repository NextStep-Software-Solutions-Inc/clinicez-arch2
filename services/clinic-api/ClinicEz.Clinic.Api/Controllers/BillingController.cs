using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Billing.Commands;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Application.Features.Billing.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/billing")]
public sealed class BillingController : ControllerBase
{
    private readonly ISender _sender;
    private readonly IClinicDocumentPdfService? _pdfService;
    private readonly IRepository<Invoice>? _invoiceRepo;
    private readonly IRepository<ClinicSettings>? _settingsRepo;
    private readonly IRepository<ClinicPatient>? _patientRepo;
    private readonly IRepository<StaffMember>? _staffRepo;
    private readonly IRepository<QueueItem>? _queueRepo;

    public BillingController(
        ISender sender,
        IClinicDocumentPdfService? pdfService = null,
        IRepository<Invoice>? invoiceRepo = null,
        IRepository<ClinicSettings>? settingsRepo = null,
        IRepository<ClinicPatient>? patientRepo = null,
        IRepository<StaffMember>? staffRepo = null,
        IRepository<QueueItem>? queueRepo = null)
    {
        _sender = sender;
        _pdfService = pdfService;
        _invoiceRepo = invoiceRepo;
        _settingsRepo = settingsRepo;
        _patientRepo = patientRepo;
        _staffRepo = staffRepo;
        _queueRepo = queueRepo;
    }

    [HttpGet("invoices")]
    [HasPermission(ClinicPermissions.BillingRead)]
    public async Task<ActionResult<ApiResponse<List<InvoiceDto>>>> GetInvoices(
        [FromQuery] DateTime? date,
        [FromQuery] Guid? patientId,
        [FromQuery] InvoiceStatus? status,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetInvoicesQuery(date, patientId, status), ct);
        return Ok(ApiResponse<List<InvoiceDto>>.Success(result));
    }

    [HttpGet("invoices/{id:guid}/pdf")]
    [HasPermission(ClinicPermissions.BillingRead)]
    public async Task<IActionResult> DownloadInvoicePdf(
        Guid id,
        CancellationToken ct)
    {
        if (_invoiceRepo == null || _pdfService == null)
            return StatusCode(503, "Document generation service is unavailable.");

        var invoice = await _invoiceRepo.Query(i => i.Id == id)
            .Include(i => i.LineItems)
            .Include(i => i.Payments)
            .FirstOrDefaultAsync(ct);

        if (invoice == null) return NotFound($"Invoice '{id}' not found.");

        var settings = (_settingsRepo != null ? await _settingsRepo.Query().FirstOrDefaultAsync(ct) : null) ?? new ClinicSettings
        {
            TenantId = invoice.TenantId ?? "default",
            ClinicId = invoice.ClinicId,
            ClinicName = "Clinic EZ Partner Medical Clinic"
        };

        var patient = (invoice.PatientId != Guid.Empty && _patientRepo != null)
            ? await _patientRepo.GetByIdAsync(invoice.PatientId, ct)
            : null;

        var doctor = (invoice.AttendingDoctorId.HasValue && _staffRepo != null)
            ? await _staffRepo.GetByIdAsync(invoice.AttendingDoctorId.Value, ct)
            : null;

        string? queueNumber = null;
        if (invoice.QueueItemId.HasValue && _queueRepo != null)
        {
            var qItem = await _queueRepo.GetByIdAsync(invoice.QueueItemId.Value, ct);
            queueNumber = qItem?.QueueNumber;
        }

        var pdfBytes = _pdfService.GenerateInvoicePdf(invoice, settings, doctor, patient, queueNumber);
        var filename = invoice.Status == InvoiceStatus.Paid
            ? $"Receipt-{invoice.InvoiceNumber}.pdf"
            : $"SOA-{invoice.InvoiceNumber}.pdf";

        return File(pdfBytes, "application/pdf", filename);
    }

    [HttpPost("invoices/preview-pdf")]
    [HasPermission(ClinicPermissions.BillingRead)]
    public async Task<IActionResult> DownloadInvoicePreviewPdf(
        [FromBody] InvoicePreviewRequest request,
        CancellationToken ct)
    {
        if (_pdfService == null)
            return StatusCode(503, "Document generation service is unavailable.");

        var settings = (_settingsRepo != null ? await _settingsRepo.Query().FirstOrDefaultAsync(ct) : null) ?? new ClinicSettings
        {
            TenantId = "default",
            ClinicName = "Clinic EZ Partner Medical Clinic"
        };

        var patient = (request.PatientId.HasValue && request.PatientId.Value != Guid.Empty && _patientRepo != null)
            ? await _patientRepo.GetByIdAsync(request.PatientId.Value, ct)
            : null;

        var pdfBytes = _pdfService.GenerateInvoicePreviewPdf(request, settings, null, patient);
        var queueSuffix = !string.IsNullOrWhiteSpace(request.QueueNumber) ? $"-{request.QueueNumber}" : "";
        return File(pdfBytes, "application/pdf", $"SOA-Preview{queueSuffix}.pdf");
    }

    [HttpPost("invoices")]
    [HasPermission(ClinicPermissions.BillingWrite)]
    public async Task<ActionResult<ApiResponse<InvoiceDto>>> CreateInvoice(
        [FromBody] CreateInvoiceRequest request,
        CancellationToken ct)
    {
        var command = new CreateInvoiceCommand(
            request.PatientId,
            request.PatientName,
            request.QueueItemId,
            request.AppointmentId,
            request.ConsultationId,
            request.AttendingDoctorId,
            request.DiscountType,
            request.DiscountIdNumber,
            request.CustomDiscountPercentage,
            request.Notes,
            request.LineItems,
            request.AllowDuplicate
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<InvoiceDto>.Success(result, "Invoice generated successfully."));
    }

    [HttpPut("invoices/{id:guid}")]
    [HasPermission(ClinicPermissions.BillingWrite)]
    public async Task<ActionResult<ApiResponse<InvoiceDto>>> UpdateInvoice(
        Guid id,
        [FromBody] UpdateInvoiceRequest request,
        CancellationToken ct)
    {
        var command = new UpdateInvoiceCommand(
            id,
            request.DiscountType,
            request.DiscountIdNumber,
            request.CustomDiscountPercentage,
            request.Notes,
            request.LineItems
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<InvoiceDto>.Success(result, "Invoice updated successfully."));
    }

    [HttpPost("invoices/{id:guid}/pay")]
    [HasPermission(ClinicPermissions.BillingWrite)]
    public async Task<ActionResult<ApiResponse<InvoiceDto>>> RecordPayment(
        Guid id,
        [FromBody] RecordPaymentRequest request,
        CancellationToken ct)
    {
        var command = new RecordPaymentCommand(
            id,
            request.Amount,
            request.Method,
            request.ReferenceNumber,
            request.Notes
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<InvoiceDto>.Success(result, "Payment recorded and receipt generated successfully."));
    }
}
