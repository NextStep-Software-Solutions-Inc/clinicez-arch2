using System;
using System.Linq;

namespace ClinicEz.Clinic.Application.Features.Documents.DTOs;

public sealed record DocumentVerificationResultDto(
    bool IsVerified,
    string DocumentType,
    string DocumentNumber,
    string FacilityName,
    string FacilityAddress,
    string PatientMaskedName,
    string DoctorName,
    string DoctorPrcLicense,
    string IssueDate,
    string Status,
    string SecurityDigest,
    string VerificationMessage,
    string? Notes = null
)
{
    public static string MaskName(string? fullName)
    {
        if (string.IsNullOrWhiteSpace(fullName)) return "Anonymous";
        var parts = fullName.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return string.Join(" ", parts.Select(p =>
        {
            if (p.Length <= 1) return p;
            if (p.Length == 2) return $"{p[0]}*";
            return $"{p[0]}{new string('*', p.Length - 2)}{p[^1]}";
        }));
    }
}
