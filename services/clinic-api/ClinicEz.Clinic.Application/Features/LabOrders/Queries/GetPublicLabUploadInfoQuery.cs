using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.LabOrders.Queries;

public record GetPublicLabUploadInfoQuery(string Token) : IRequest<PublicLabUploadInfoResponse>;

public class GetPublicLabUploadInfoQueryHandler : IRequestHandler<GetPublicLabUploadInfoQuery, PublicLabUploadInfoResponse>
{
    private readonly IRepository<ClinicLabOrder> _orderRepo;
    private readonly IRepository<ClinicPatient> _patientRepo;

    public GetPublicLabUploadInfoQueryHandler(
        IRepository<ClinicLabOrder> orderRepo,
        IRepository<ClinicPatient> patientRepo)
    {
        _orderRepo = orderRepo;
        _patientRepo = patientRepo;
    }

    public async Task<PublicLabUploadInfoResponse> Handle(GetPublicLabUploadInfoQuery request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            throw new BadRequestException("Upload token is required.");
        }

        var order = await _orderRepo.Query(o => o.PublicUploadToken == request.Token)
            .Include(o => o.Items)
            .FirstOrDefaultAsync(cancellationToken);

        if (order == null)
        {
            throw new NotFoundException("Invalid or expired laboratory upload link.");
        }

        var patient = await _patientRepo.GetByIdAsync(order.PatientId, cancellationToken);

        // Mask patient name for HIPAA/DPA privacy on public upload page
        var initials = string.Join(" ", order.PatientName.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(w => $"{w[0]}."));

        var age = patient != null ? DateTime.UtcNow.Year - patient.DateOfBirth.Year : 0;

        return new PublicLabUploadInfoResponse(
            order.OrderNumber,
            initials,
            age,
            patient?.Gender.ToString() ?? "Unknown",
            order.OrderedByDoctorName ?? "Attending Physician",
            "St. Jude Family Clinic & Primary Care",
            order.ClinicalDiagnosis,
            order.Items.Select(i => i.TestName).ToList(),
            order.OrderDate
        );
    }
}
