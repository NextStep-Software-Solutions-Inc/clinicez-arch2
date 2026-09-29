using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.LabOrders.Queries;

public record LabOrderSlipItemDto(
    string TestName,
    string Category,
    string? Instructions
);

public record LabOrderSlipDto(
    Guid OrderId,
    string OrderNumber,
    DateTime OrderDate,
    string ClinicName,
    string ClinicAddress,
    string ClinicContact,
    string DoctorName,
    string DoctorPrcLicense,
    string? DoctorPtr,
    Guid PatientId,
    string PatientName,
    int PatientAge,
    string PatientGender,
    string? PhilHealthNumber,
    string? ClinicalDiagnosis,
    string? FastingInstructions,
    List<LabOrderSlipItemDto> Items,
    string PublicUploadToken,
    string PublicUploadUrl,
    string QrPayload
);

public record GetClinicLabOrderSlipQuery(Guid OrderId) : IRequest<LabOrderSlipDto>;

public class GetClinicLabOrderSlipQueryHandler : IRequestHandler<GetClinicLabOrderSlipQuery, LabOrderSlipDto>
{
    private readonly IRepository<ClinicLabOrder> _orderRepo;
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<ClinicSettings> _settingsRepo;

    public GetClinicLabOrderSlipQueryHandler(
        IRepository<ClinicLabOrder> orderRepo,
        IRepository<ClinicPatient> patientRepo,
        IRepository<ClinicSettings> settingsRepo)
    {
        _orderRepo = orderRepo;
        _patientRepo = patientRepo;
        _settingsRepo = settingsRepo;
    }

    public async Task<LabOrderSlipDto> Handle(GetClinicLabOrderSlipQuery request, CancellationToken cancellationToken)
    {
        var order = await _orderRepo.Query(o => o.Id == request.OrderId)
            .Include(o => o.Items)
            .FirstOrDefaultAsync(cancellationToken);

        if (order == null)
        {
            throw new NotFoundException($"Clinic lab order with ID '{request.OrderId}' was not found.");
        }

        var patient = await _patientRepo.GetByIdAsync(order.PatientId, cancellationToken);
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(cancellationToken);

        var token = order.PublicUploadToken ?? Guid.NewGuid().ToString("N")[..16];
        var uploadUrl = $"/api/v1/public/lab-upload/{token}";
        var qrPayload = $"CLINICEZ:REQ:{order.OrderNumber}:{token}";

        var patientAge = patient != null ? DateTime.UtcNow.Year - patient.DateOfBirth.Year : 40;

        return new LabOrderSlipDto(
            order.Id,
            order.OrderNumber,
            order.OrderDate,
            settings?.ClinicName ?? "St. Jude Family Clinic & Primary Care",
            settings?.LetterheadAddress ?? "124 Rizal Avenue, San Pedro, Laguna",
            settings?.LetterheadContact ?? "Tel: (02) 8876-5432 • Mobile: +63 917 123 4567",
            order.OrderedByDoctorName ?? "Dr. Cruz, MD",
            "0149281",
            "PTR-2026-9912",
            order.PatientId,
            order.PatientName,
            patientAge,
            patient?.Gender.ToString() ?? "Unknown",
            patient?.PhilHealthNumber,
            order.ClinicalDiagnosis,
            order.Notes,
            order.Items.Select(i => new LabOrderSlipItemDto(i.TestName, i.Category, i.Instructions)).ToList(),
            token,
            uploadUrl,
            qrPayload
        );
    }
}
