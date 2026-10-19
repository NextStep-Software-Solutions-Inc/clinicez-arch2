using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
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
        var digitsPin = !string.IsNullOrWhiteSpace(rawPin) ? FuzzyMatcher.NormalizePhilHealthPin(rawPin) : null;
        var contact = request.ContactNumber?.Trim();
        var normContact = !string.IsNullOrWhiteSpace(contact) ? FuzzyMatcher.NormalizePhone(contact) : null;
        var firstName = request.FirstName?.Trim();
        var lastName = request.LastName?.Trim();
        var dob = request.DateOfBirth;

        bool hasPin = !string.IsNullOrWhiteSpace(rawPin);
        bool hasContact = !string.IsNullOrWhiteSpace(contact);
        bool hasDob = dob.HasValue;
        bool hasName = !string.IsNullOrWhiteSpace(firstName) && !string.IsNullOrWhiteSpace(lastName);
        bool hasNameDob = hasName && hasDob;

        if (!hasPin && !hasContact && !hasNameDob)
        {
            return new DuplicatePatientCheckResultDto(false, Array.Empty<DuplicateMatchDto>());
        }

        // Query active clinic patients (multi-tenant query filter applied automatically)
        var query = _patientRepo.Query().AsNoTracking();

        // Filter candidates matching any dimension to bound memory footprint
        var candidates = await query
            .Where(p =>
                (hasPin && p.PhilHealthNumber != null && (p.PhilHealthNumber == rawPin || (digitsPin != null && p.PhilHealthNumber.Replace("-", "").Trim() == digitsPin))) ||
                (hasContact && p.ContactNumber != null && (p.ContactNumber == contact || (normContact != null && (p.ContactNumber.Contains(normContact) || normContact.Contains(p.ContactNumber))))) ||
                (hasNameDob && p.DateOfBirth == dob!.Value))
            .Take(200)
            .ToListAsync(ct);

        if (candidates.Count == 0)
        {
            return new DuplicatePatientCheckResultDto(false, Array.Empty<DuplicateMatchDto>());
        }

        var matchesMap = new Dictionary<Guid, (ClinicPatient Patient, List<string> Reasons, double MaxScore, string Confidence)>();

        foreach (var p in candidates)
        {
            var reasons = new List<string>();
            double maxScore = 0.0;

            // 1. PIN Match (Exact 12-digit or string match)
            if (hasPin && !string.IsNullOrWhiteSpace(p.PhilHealthNumber))
            {
                var patientPinRaw = p.PhilHealthNumber.Trim();
                var patientPinDigits = FuzzyMatcher.NormalizePhilHealthPin(patientPinRaw);
                if (patientPinRaw.Equals(rawPin, StringComparison.OrdinalIgnoreCase) ||
                    (!string.IsNullOrEmpty(digitsPin) && patientPinDigits == digitsPin))
                {
                    reasons.Add("PhilHealth Identification Number (PIN) match");
                    maxScore = Math.Max(maxScore, 1.00);
                }
            }

            // 2. Contact Number Match (Exact or normalized phone match)
            if (hasContact && !string.IsNullOrWhiteSpace(p.ContactNumber))
            {
                var candidateNormPhone = FuzzyMatcher.NormalizePhone(p.ContactNumber);
                bool isExactPhone = p.ContactNumber.Trim().Equals(contact, StringComparison.OrdinalIgnoreCase);
                bool isNormPhoneMatch = !string.IsNullOrEmpty(normContact) &&
                                        !string.IsNullOrEmpty(candidateNormPhone) &&
                                        candidateNormPhone == normContact;

                if (isExactPhone || isNormPhoneMatch)
                {
                    reasons.Add("Contact Number match");
                    maxScore = Math.Max(maxScore, 0.95);
                }
            }

            // 3. Name & Date of Birth Match (Exact, Fuzzy Levenshtein, Phonetic Soundex)
            if (hasNameDob && p.DateOfBirth == dob!.Value)
            {
                bool isExactName = p.FirstName.Trim().Equals(firstName, StringComparison.OrdinalIgnoreCase) &&
                                   p.LastName.Trim().Equals(lastName, StringComparison.OrdinalIgnoreCase);

                if (isExactName)
                {
                    reasons.Add("Full Name and Date of Birth match");
                    maxScore = Math.Max(maxScore, 1.00);
                }
                else
                {
                    // Fuzzy Levenshtein evaluation
                    double simFirst = FuzzyMatcher.CalculateSimilarity(p.FirstName, firstName);
                    double simLast = FuzzyMatcher.CalculateSimilarity(p.LastName, lastName);
                    int distFirst = FuzzyMatcher.LevenshteinDistance(p.FirstName, firstName);
                    int distLast = FuzzyMatcher.LevenshteinDistance(p.LastName, lastName);

                    string cleanFullP = $"{p.FirstName} {p.LastName}";
                    string cleanFullQ = $"{firstName} {lastName}";
                    double simFull = FuzzyMatcher.CalculateSimilarity(cleanFullP, cleanFullQ);
                    double maxSim = Math.Max(simFull, (simFirst + simLast) / 2.0);

                    bool isLevenshteinMatch = (distFirst <= 2 && distLast <= 2) || maxSim >= 0.80;

                    if (isLevenshteinMatch)
                    {
                        int matchPercentage = (int)Math.Round(maxSim * 100);
                        reasons.Add($"Matching Date of Birth with similar name ('{p.FirstName} {p.LastName}', {matchPercentage}% match)");
                        double fuzzyScore = Math.Round(0.80 + (maxSim * 0.15), 2);
                        maxScore = Math.Max(maxScore, fuzzyScore);
                    }

                    // Soundex Phonetic evaluation
                    string soundexFirstP = FuzzyMatcher.ToSoundex(p.FirstName);
                    string soundexFirstQ = FuzzyMatcher.ToSoundex(firstName);
                    string soundexLastP = FuzzyMatcher.ToSoundex(p.LastName);
                    string soundexLastQ = FuzzyMatcher.ToSoundex(lastName);

                    if (soundexLastP == soundexLastQ && (soundexFirstP == soundexFirstQ || simFirst >= 0.70))
                    {
                        if (!reasons.Any(r => r.Contains("phonetic", StringComparison.OrdinalIgnoreCase)))
                        {
                            reasons.Add("Matching Date of Birth and phonetic name match (Soundex)");
                        }
                        maxScore = Math.Max(maxScore, 0.88);
                    }
                }
            }

            if (reasons.Count > 0)
            {
                // Multi-factor boost: if multiple distinct criteria match, boost confidence to 1.0
                if (reasons.Count > 1)
                {
                    maxScore = Math.Min(1.00, Math.Max(maxScore, 0.98));
                }

                string confidence = maxScore >= 0.85 ? "High" : maxScore >= 0.70 ? "Medium" : "Low";

                if (!matchesMap.TryGetValue(p.Id, out var existing))
                {
                    matchesMap[p.Id] = (p, reasons, maxScore, confidence);
                }
                else
                {
                    existing.Reasons.AddRange(reasons.Except(existing.Reasons));
                    var updatedScore = Math.Max(existing.MaxScore, maxScore);
                    var updatedConfidence = updatedScore >= 0.85 ? "High" : updatedScore >= 0.70 ? "Medium" : "Low";
                    matchesMap[p.Id] = (existing.Patient, existing.Reasons, updatedScore, updatedConfidence);
                }
            }
        }

        var resultMatches = matchesMap.Values
            .Select(entry =>
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
                    string.Join(" • ", entry.Reasons),
                    entry.MaxScore,
                    entry.Confidence
                );
            })
            .OrderByDescending(m => m.SimilarityScore ?? 0)
            .ThenBy(m => m.FullName)
            .ToList();

        return new DuplicatePatientCheckResultDto(resultMatches.Count > 0, resultMatches);
    }
}
