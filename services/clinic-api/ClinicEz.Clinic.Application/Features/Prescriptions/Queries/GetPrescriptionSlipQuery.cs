using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Documents.Security;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Clinic.Application.Features.Prescriptions.Queries;

public record GetPrescriptionSlipQuery(Guid? ConsultationId = null, string? PrescriptionNumber = null) : IRequest<PrescriptionSlipDto>;

public class GetPrescriptionSlipQueryHandler : IRequestHandler<GetPrescriptionSlipQuery, PrescriptionSlipDto>
{
    private readonly IRepository<ConsultationEncounter> _encounterRepo;
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IRepository<ClinicSettings> _settingsRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IConfiguration? _configuration;

    public GetPrescriptionSlipQueryHandler(
        IRepository<ConsultationEncounter> encounterRepo,
        IRepository<ClinicPatient> patientRepo,
        IRepository<StaffMember> staffRepo,
        IRepository<ClinicSettings> settingsRepo,
        IUnitOfWork unitOfWork,
        IConfiguration? configuration = null)
    {
        _encounterRepo = encounterRepo;
        _patientRepo = patientRepo;
        _staffRepo = staffRepo;
        _settingsRepo = settingsRepo;
        _unitOfWork = unitOfWork;
        _configuration = configuration;
    }

    public async Task<PrescriptionSlipDto> Handle(GetPrescriptionSlipQuery request, CancellationToken cancellationToken)
    {
        var query = _encounterRepo.Query().Include(e => e.Prescriptions).AsQueryable();

        if (request.ConsultationId.HasValue)
        {
            query = query.Where(e => e.Id == request.ConsultationId.Value);
        }
        else if (!string.IsNullOrWhiteSpace(request.PrescriptionNumber))
        {
            query = query.Where(e => e.PrescriptionNumber == request.PrescriptionNumber);
        }
        else
        {
            throw new BadRequestException("Either ConsultationId or PrescriptionNumber must be specified.");
        }

        var encounter = await query.FirstOrDefaultAsync(cancellationToken);

        if (encounter == null)
        {
            throw new NotFoundException("Clinical consultation or electronic prescription was not found.");
        }

        var patient = await _patientRepo.GetByIdAsync(encounter.PatientId, cancellationToken);
        var staffDoctor = await _staffRepo.Query(s => s.Id == encounter.DoctorId).FirstOrDefaultAsync(cancellationToken);
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(cancellationToken);

        bool needsUpdate = false;
        if (string.IsNullOrWhiteSpace(encounter.PrescriptionNumber))
        {
            encounter.PrescriptionNumber = $"RX-{encounter.EncounterDate:yyyyMMdd}-{encounter.Id.ToString("N")[..6].ToUpper()}";
            needsUpdate = true;
        }

        if (string.IsNullOrWhiteSpace(encounter.RxPublicVerificationToken))
        {
            encounter.RxPublicVerificationToken = $"{encounter.ClinicId:N}.{Guid.NewGuid():N}";
            needsUpdate = true;
        }

        if (needsUpdate)
        {
            _encounterRepo.Update(encounter);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

        var token = encounter.RxPublicVerificationToken;
        var portalBase = VerificationUrlResolver.Resolve(_configuration).TrimEnd('/');
        var rxVerifyUrl = !string.IsNullOrWhiteSpace(portalBase)
            ? $"{portalBase}/rx-verify/{token}"
            : $"/rx-verify/{token}";
        var uploadUrl = rxVerifyUrl;
        var qrPayload = rxVerifyUrl;

        var patientAge = patient != null ? Math.Max(0, DateTime.UtcNow.Year - patient.DateOfBirth.Year) : 35;

        return new PrescriptionSlipDto(
            encounter.Id,
            encounter.PrescriptionNumber,
            encounter.SignedAt ?? encounter.EncounterDate,
            settings?.ClinicName ?? "St. Jude Family Clinic & Primary Care",
            settings?.LetterheadAddress ?? "124 Rizal Avenue, San Pedro, Laguna",
            settings?.LetterheadContact ?? "Tel: (02) 8876-5432 • Mobile: +63 917 123 4567",
            encounter.DoctorName,
            encounter.DoctorPrcLicense ?? staffDoctor?.PrcLicenseNumber ?? "0149281",
            encounter.DoctorPtr ?? staffDoctor?.PtrNumber ?? "PTR-2026-9912",
            encounter.DoctorS2License ?? staffDoctor?.S2LicenseNumber,
            staffDoctor?.Specialty ?? "General Practice / Family Medicine",
            encounter.PatientId,
            encounter.PatientName,
            patientAge,
            patient?.Gender.ToString() ?? "Unknown",
            patient?.PhilHealthNumber,
            patient?.Allergies,
            encounter.Assessment,
            encounter.Plan,
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
            token,
            uploadUrl,
            qrPayload,
            encounter.RxDispenseStatus.ToString(),
            encounter.RxDispensedPharmacyName,
            encounter.RxDispensedPharmacistName,
            encounter.RxDispensedPharmacistPrc,
            encounter.RxDispensedReceiptNumber,
            encounter.RxDispensedReceiptUrl,
            encounter.RxDispensedAt,
            encounter.RxNotes,
            RxPharmacyStatusDto.From(encounter),
            patient?.DateOfBirth
        );
    }
}
