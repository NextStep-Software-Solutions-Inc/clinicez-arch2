using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interoperability;
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
    string PublicUploadUrl,
    string QrPayload,
    string? ClaimToken = null
);

/// <summary>
/// Builds the printable slip. Printing issues a fresh one-time upload link (the stored grant is only a hash, so an earlier
/// link cannot be shown again); the previous unused link stops working.
/// </summary>
public record GetClinicLabOrderSlipQuery(Guid OrderId) : IRequest<LabOrderSlipDto>;

public class GetClinicLabOrderSlipQueryHandler : IRequestHandler<GetClinicLabOrderSlipQuery, LabOrderSlipDto>
{
    private readonly IRepository<ClinicLabOrder> _orderRepo;
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<ClinicSettings> _settingsRepo;
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IUploadGrantService _uploadGrants;
    private readonly IUnitOfWork _unitOfWork;

    public GetClinicLabOrderSlipQueryHandler(
        IRepository<ClinicLabOrder> orderRepo,
        IRepository<ClinicPatient> patientRepo,
        IRepository<ClinicSettings> settingsRepo,
        IRepository<StaffMember> staffRepo,
        IUploadGrantService uploadGrants,
        IUnitOfWork unitOfWork)
    {
        _orderRepo = orderRepo;
        _patientRepo = patientRepo;
        _settingsRepo = settingsRepo;
        _staffRepo = staffRepo;
        _uploadGrants = uploadGrants;
        _unitOfWork = unitOfWork;
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
        var doctor = order.OrderedByDoctorId is { } doctorId
            ? await _staffRepo.Query(s => s.Id == doctorId).FirstOrDefaultAsync(cancellationToken)
            : null;

        var upload = await _uploadGrants.MintAsync(order, UploaderKind.ExternalLab, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // The claim QR is what a ClinicEZ laboratory scans to take the order; a routed or local slip falls back to the order number.
        var qrPayload = order.ClaimToken ?? $"CLINICEZ:REQ:{order.OrderNumber}";

        var patientAge = patient != null ? DateTime.UtcNow.Year - patient.DateOfBirth.Year : 40;

        return new LabOrderSlipDto(
            order.Id,
            order.OrderNumber,
            order.OrderDate,
            settings?.ClinicName ?? "St. Jude Family Clinic & Primary Care",
            settings?.LetterheadAddress ?? "124 Rizal Avenue, San Pedro, Laguna",
            settings?.LetterheadContact ?? "Tel: (02) 8876-5432 • Mobile: +63 917 123 4567",
            order.OrderedByDoctorName ?? "Dr. Cruz, MD",
            doctor?.PrcLicenseNumber ?? string.Empty,
            doctor?.PtrNumber,
            order.PatientId,
            order.PatientName,
            patientAge,
            patient?.Gender.ToString() ?? "Unknown",
            patient?.PhilHealthNumber,
            order.ClinicalDiagnosis,
            order.Notes,
            order.Items.Select(i => new LabOrderSlipItemDto(i.TestName, i.Category, i.Instructions)).ToList(),
            upload.Url,
            qrPayload,
            order.ClaimToken
        );
    }
}
