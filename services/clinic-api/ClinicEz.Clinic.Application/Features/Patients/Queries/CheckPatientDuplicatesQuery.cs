using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;

public sealed record CheckPatientDuplicatesQuery(
    string? PhilHealthNumber = null,
    string? ContactNumber = null,
    string? FirstName = null,
    string? LastName = null,
    DateOnly? DateOfBirth = null
) : IRequest<DuplicatePatientCheckResultDto>;

public sealed class CheckPatientDuplicatesQueryHandler : IRequestHandler<CheckPatientDuplicatesQuery, DuplicatePatientCheckResultDto>
{
    private readonly IRepository<ClinicPatient> _patientRepo;

    public CheckPatientDuplicatesQueryHandler(IRepository<ClinicPatient> patientRepo)
    {
        _patientRepo = patientRepo;
    }

    public async Task<DuplicatePatientCheckResultDto> Handle(CheckPatientDuplicatesQuery request, CancellationToken ct)
    {
        var rawPin = request.PhilHealthNumber?.Trim();
        var digitsPin = !string.IsNullOrWhiteSpace(rawPin) ? new string(rawPin.Where(char.IsDigit).ToArray()) : null;
        var contact = request.ContactNumber?.Trim();
        var firstName = request.FirstName?.Trim();
        var lastName = request.LastName?.Trim();
        var dob = request.DateOfBirth;

        bool hasPin = !string.IsNullOrWhiteSpace(rawPin);
        bool hasContact = !string.IsNullOrWhiteSpace(contact);
        bool hasNameDob = !string.IsNullOrWhiteSpace(firstName) && !string.IsNullOrWhiteSpace(lastName) && dob.HasValue;

        if (!hasPin && !hasContact && !hasNameDob)
        {
            return new DuplicatePatientCheckResultDto(false, Array.Empty<DuplicateMatchDto>());
        }

        // Query active clinic patients (multi-tenant query filter applied automatically)
        var query = _patientRepo.Query().AsNoTracking();

        // Filter candidates matching any of the criteria to minimize memory footprint
        var candidates = await query
            .Where(p =>
                (hasPin && p.PhilHealthNumber != null && (p.PhilHealthNumber == rawPin || (digitsPin != null && p.PhilHealthNumber.Replace("-", "").Trim() == digitsPin))) ||
                (hasContact && p.ContactNumber == contact) ||
                (hasNameDob && p.DateOfBirth == dob!.Value && p.FirstName.ToLower() == firstName!.ToLower() && p.LastName.ToLower() == lastName!.ToLower()))
            .ToListAsync(ct);

        if (candidates.Count == 0)
        {
            return new DuplicatePatientCheckResultDto(false, Array.Empty<DuplicateMatchDto>());
        }

        var matchesMap = new Dictionary<Guid, (ClinicPatient Patient, List<string> Reasons)>();

        foreach (var p in candidates)
        {
            var reasons = new List<string>();

            // 1. PIN Match
            if (hasPin && !string.IsNullOrWhiteSpace(p.PhilHealthNumber))
            {
                var patientPinRaw = p.PhilHealthNumber.Trim();
                var patientPinDigits = new string(patientPinRaw.Where(char.IsDigit).ToArray());
                if (patientPinRaw.Equals(rawPin, StringComparison.OrdinalIgnoreCase) ||
                    (!string.IsNullOrEmpty(digitsPin) && patientPinDigits == digitsPin))
                {
                    reasons.Add("PhilHealth Identification Number (PIN) match");
                }
            }

            // 2. Contact Match
            if (hasContact && !string.IsNullOrWhiteSpace(p.ContactNumber) &&
                p.ContactNumber.Trim().Equals(contact, StringComparison.OrdinalIgnoreCase))
            {
                reasons.Add("Contact Number match");
            }

            // 3. Name + DOB Match
            if (hasNameDob && p.DateOfBirth == dob!.Value &&
                p.FirstName.Trim().Equals(firstName, StringComparison.OrdinalIgnoreCase) &&
                p.LastName.Trim().Equals(lastName, StringComparison.OrdinalIgnoreCase))
            {
                reasons.Add("Full Name and Date of Birth match");
            }

            if (reasons.Count > 0)
            {
                if (!matchesMap.TryGetValue(p.Id, out var existing))
                {
                    matchesMap[p.Id] = (p, reasons);
                }
                else
                {
                    existing.Reasons.AddRange(reasons.Except(existing.Reasons));
                }
            }
        }

        var resultMatches = matchesMap.Values.Select(entry =>
        {
            var p = entry.Patient;
            var middleInitial = !string.IsNullOrWhiteSpace(p.MiddleName) ? $" {p.MiddleName[0]}." : "";
            var suffix = !string.IsNullOrWhiteSpace(p.Suffix) ? $" {p.Suffix}" : "";
            var fullName = $"{p.LastName}, {p.FirstName}{middleInitial}{suffix}";

            return new DuplicateMatchDto(
                p.Id,
                p.PatientCode,
                fullName,
                p.DateOfBirth,
                p.ContactNumber,
                p.PhilHealthNumber,
                string.Join(" • ", entry.Reasons)
            );
        }).ToList();

        return new DuplicatePatientCheckResultDto(resultMatches.Count > 0, resultMatches);
    }
}
