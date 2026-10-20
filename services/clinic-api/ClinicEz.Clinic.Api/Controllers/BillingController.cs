using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Billing.Commands;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Application.Features.Billing.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/billing")]
public sealed class BillingController : ControllerBase
{
    private readonly ISender _sender;

    public BillingController(ISender sender)
    {
        _sender = sender;
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
            request.AttendingDoctorName,
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
