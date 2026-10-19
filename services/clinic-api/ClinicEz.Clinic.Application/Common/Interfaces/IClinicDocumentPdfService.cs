using ClinicEz.Clinic.Application.Features.LabOrders.Queries;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

public interface IClinicDocumentPdfService
{
    byte[] GenerateMedicalCertificatePdf(MedicalCertificate cert, ClinicSettings settings, ClinicPatient? patient = null);
    byte[] GenerateLabRequisitionSlipPdf(LabOrderSlipDto slip, ClinicSettings settings);
    byte[] GeneratePrescriptionPdf(PrescriptionSlipDto slip, ClinicSettings settings);
    byte[] GenerateReferralLetterPdf(ReferralLetter referral, ClinicSettings settings, ClinicPatient? patient = null, StaffMember? doctor = null);
    byte[] GenerateReceptionPlacardPdf(ClinicSettings settings, string qrUrl, string? joinCode = null, string? expiresAtFormatted = null);
}
