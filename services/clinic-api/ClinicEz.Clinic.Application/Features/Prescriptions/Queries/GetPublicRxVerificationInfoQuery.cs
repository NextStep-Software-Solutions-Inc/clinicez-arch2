using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Prescriptions.Queries;

public record GetPublicRxVerificationInfoQuery(string Token) : IRequest<PublicRxVerificationInfoDto>;

public class GetPublicRxVerificationInfoQueryHandler : IRequestHandler<GetPublicRxVerificationInfoQuery, PublicRxVerificationInfoDto>
{
    private readonly IRepository<ConsultationEncounter> _encounterRepo;
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IRepository<ClinicSettings> _settingsRepo;

    public GetPublicRxVerificationInfoQueryHandler(
        IRepository<ConsultationEncounter> encounterRepo,
        IRepository<ClinicPatient> patientRepo,
        IRepository<StaffMember> staffRepo,
        IRepository<ClinicSettings> settingsRepo)
    {
        _encounterRepo = encounterRepo;
        _patientRepo = patientRepo;
        _staffRepo = staffRepo;
        _settingsRepo = settingsRepo;
    }

    public async Task<PublicRxVerificationInfoDto> Handle(GetPublicRxVerificationInfoQuery request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            throw new BadRequestException("Verification token is required.");
        }

        var encounter = await _encounterRepo.Query(e => e.RxPublicVerificationToken == request.Token)
            .Include(e => e.Prescriptions)
            .FirstOrDefaultAsync(cancellationToken);

        if (encounter == null)
        {
            throw new NotFoundException("Invalid or expired e-prescription verification token.");
        }

        var patient = await _patientRepo.GetByIdAsync(encounter.PatientId, cancellationToken);
        var staffDoctor = await _staffRepo.Query(s => s.Id == encounter.DoctorId).FirstOrDefaultAsync(cancellationToken);
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(cancellationToken);

        var patientAge = patient != null ? Math.Max(0, DateTime.UtcNow.Year - patient.DateOfBirth.Year) : 35;
        var isAlreadyDispensed = encounter.RxDispenseStatus == PrescriptionDispenseStatus.DispensedAtPartnerPharmacy ||
                                 encounter.RxDispenseStatus == PrescriptionDispenseStatus.DispensedExternally;

        var patientInitials = string.Join(" ", encounter.PatientName.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(w => w.Length > 1 ? $"{w[0]}***" : $"{w[0]}*"));

        var issuedAt = encounter.SignedAt ?? encounter.EncounterDate;
        var expiresAt = issuedAt.AddDays(30);
        var isExpired = DateTime.UtcNow > expiresAt;

        return new PublicRxVerificationInfoDto(
            encounter.PrescriptionNumber ?? $"RX-{encounter.EncounterDate:yyyyMMdd}",
            issuedAt,
            settings?.ClinicName ?? "St. Jude Family Clinic & Primary Care",
            settings?.LetterheadAddress ?? "124 Rizal Avenue, San Pedro, Laguna",
            settings?.LetterheadContact ?? "Tel: (02) 8876-5432",
            encounter.DoctorName,
            encounter.DoctorPrcLicense ?? staffDoctor?.PrcLicenseNumber ?? "0149281",
            encounter.DoctorPtr ?? staffDoctor?.PtrNumber,
            encounter.DoctorS2License ?? staffDoctor?.S2LicenseNumber,
            encounter.PatientName,
            patientInitials,
            patientAge,
            patient?.Gender.ToString() ?? "Unknown",
            patient?.Allergies,
            encounter.Assessment,
            encounter.Prescriptions.Select(p => new PrescriptionSlipItemDto(
                p.Id,
                p.GenericName,
                p.BrandName,
                p.Dosage,
                p.Form,
                p.Sig,
                p.Quantity,
                p.DurationDays,
                p.Refills,
                p.IsDangerousDrug,
                p.Remarks
            )).ToList(),
            encounter.RxDispenseStatus.ToString(),
            IsValid: encounter.IsSigned,
            IsAlreadyDispensed: isAlreadyDispensed,
            encounter.RxDispensedPharmacyName,
            encounter.RxDispensedReceiptNumber,
            encounter.RxDispensedAt,
            encounter.RxNotes,
            expiresAt,
            isExpired
        );
    }
}
