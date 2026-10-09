using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.LabOrders.Queries;

public record GetPublicLabUploadInfoQuery(string Token) : IRequest<PublicLabUploadInfoResponse>;

public class GetPublicLabUploadInfoQueryHandler : IRequestHandler<GetPublicLabUploadInfoQuery, PublicLabUploadInfoResponse>
{
    private readonly IUploadGrantService _grants;

    public GetPublicLabUploadInfoQueryHandler(IUploadGrantService grants)
    {
        _grants = grants;
    }

    public async Task<PublicLabUploadInfoResponse> Handle(GetPublicLabUploadInfoQuery request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            throw new BadRequestException("Upload token is required.");
        }

        var context = await _grants.ResolveAsync(request.Token, cancellationToken)
            ?? throw new NotFoundException("Invalid or expired laboratory upload link.");

        var order = context.Order;
        var patient = context.Patient;

        // Mask patient name for Philippine DPA (RA 10173) privacy: e.g. "Juan Dela Cruz" -> "J*** D*** C***"
        var initials = string.Join(" ", order.PatientName.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(w => w.Length > 1 ? $"{w[0]}***" : $"{w[0]}*"));

        var age = patient != null ? PatientAge.InYears(patient.DateOfBirth, DateOnly.FromDateTime(DateTime.UtcNow)) : 0;

        return new PublicLabUploadInfoResponse(
            order.OrderNumber,
            initials,
            age,
            patient?.Gender.ToString() ?? "Unknown",
            order.OrderedByDoctorName ?? "Attending Physician",
            context.Clinic?.ClinicName ?? string.Empty,
            order.ClinicalDiagnosis,
            order.Items.Select(i => i.TestName).ToList(),
            order.OrderDate,
            null,
            context.Grant.ExpiresAt,
            !context.IsUsable(DateTime.UtcNow),
            order.Stage.ToString()
        );
    }
}
