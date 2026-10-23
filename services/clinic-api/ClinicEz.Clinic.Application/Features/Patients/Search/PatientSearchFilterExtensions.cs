using System;
using System.Linq;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Features.Patients.Search;

/// <summary>
/// Provides unified patient search filtering across ClinicEzId, discrete name components,
/// combined full names, inverted names, suffixes, and Philippine healthcare/clinic identifiers.
/// </summary>
public static class PatientSearchFilterExtensions
{
    /// <summary>
    /// Filters clinic patients by the provided search term supporting:
    /// - ClinicEzId: exact ("CE-WDP9-FMBJ"), partial ("WDP9"), unhyphenated ("cewdp9fmbj")
    /// - Discrete name components: FirstName, MiddleName, LastName, Suffix
    /// - Combined full names: "First Last", "First Middle Last", and space-normalized forms
    /// - Inverted names: "Last, First", "Last First", "Last, First Middle", "Last First Middle"
    /// - Full names with suffix
    /// - PatientCode, ContactNumber, PhilHealthNumber (hyphenated and unhyphenated), SeniorCitizenId, PwdId
    /// Translates cleanly in both EF Core Npgsql and EF Core InMemory providers.
    /// </summary>
    public static IQueryable<ClinicPatient> WhereMatchesSearchTerm(this IQueryable<ClinicPatient> query, string? searchTerm)
    {
        if (string.IsNullOrWhiteSpace(searchTerm))
            return query;

        var rawTerm = searchTerm.Trim();
        if (rawTerm.Length == 0)
            return query;

        var term = rawTerm.ToLowerInvariant();
        var unhyphenated = term.Replace("-", "").Replace(" ", "");

        // Split tokens ignoring punctuation (spaces and commas)
        var words = term.Split(new[] { ' ', ',' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var spaceNormalized = string.Join(" ", words);

        // Pre-extract up to 5 individual tokens for multi-token name matching
        var wordCount = words.Length;
        var w0 = wordCount > 0 ? words[0] : "";
        var w1 = wordCount > 1 ? words[1] : "";
        var w2 = wordCount > 2 ? words[2] : "";
        var w3 = wordCount > 3 ? words[3] : "";
        var w4 = wordCount > 4 ? words[4] : "";

        return query.Where(p =>
            // 1. ClinicEzId (exact, partial, unhyphenated)
            (p.ClinicEzId != null && (
                p.ClinicEzId.ToLower().Contains(term) ||
                (unhyphenated.Length > 0 && p.ClinicEzId.ToLower().Contains(unhyphenated)) ||
                (unhyphenated.Length > 0 && p.ClinicEzId.ToLower().Replace("-", "").Contains(unhyphenated)) ||
                p.ClinicEzId.ToLower().Replace("-", "").Contains(term)
            )) ||

            // 2. Individual name components
            p.FirstName.ToLower().Contains(term) ||
            p.LastName.ToLower().Contains(term) ||
            (p.MiddleName != null && p.MiddleName.ToLower().Contains(term)) ||
            (p.Suffix != null && p.Suffix.ToLower().Contains(term)) ||
            (spaceNormalized.Length > 0 && (
                p.FirstName.ToLower().Contains(spaceNormalized) ||
                p.LastName.ToLower().Contains(spaceNormalized) ||
                (p.MiddleName != null && p.MiddleName.ToLower().Contains(spaceNormalized)) ||
                (p.Suffix != null && p.Suffix.ToLower().Contains(spaceNormalized))
            )) ||

            // 3. Combined full names ("First Last", "First Middle Last") and space-normalized forms
            (p.FirstName + " " + p.LastName).ToLower().Contains(term) ||
            (spaceNormalized.Length > 0 && (p.FirstName + " " + p.LastName).ToLower().Contains(spaceNormalized)) ||
            (p.MiddleName != null && (
                (p.FirstName + " " + p.MiddleName + " " + p.LastName).ToLower().Contains(term) ||
                (spaceNormalized.Length > 0 && (p.FirstName + " " + p.MiddleName + " " + p.LastName).ToLower().Contains(spaceNormalized))
            )) ||

            // 4. Inverted names ("Last, First", "Last First", "Last, First Middle", "Last First Middle")
            (p.LastName + ", " + p.FirstName).ToLower().Contains(term) ||
            (p.LastName + " " + p.FirstName).ToLower().Contains(term) ||
            (spaceNormalized.Length > 0 && (p.LastName + " " + p.FirstName).ToLower().Contains(spaceNormalized)) ||
            (p.MiddleName != null && (
                (p.LastName + ", " + p.FirstName + " " + p.MiddleName).ToLower().Contains(term) ||
                (p.LastName + " " + p.FirstName + " " + p.MiddleName).ToLower().Contains(term) ||
                (spaceNormalized.Length > 0 && (p.LastName + " " + p.FirstName + " " + p.MiddleName).ToLower().Contains(spaceNormalized))
            )) ||

            // 5. Full names with Suffix (forward and inverted)
            (p.Suffix != null && (
                (p.FirstName + " " + p.LastName + " " + p.Suffix).ToLower().Contains(term) ||
                (spaceNormalized.Length > 0 && (p.FirstName + " " + p.LastName + " " + p.Suffix).ToLower().Contains(spaceNormalized)) ||
                (p.LastName + ", " + p.FirstName + " " + p.Suffix).ToLower().Contains(term) ||
                (p.LastName + " " + p.FirstName + " " + p.Suffix).ToLower().Contains(term) ||
                (spaceNormalized.Length > 0 && (p.LastName + " " + p.FirstName + " " + p.Suffix).ToLower().Contains(spaceNormalized))
            )) ||
            (p.MiddleName != null && p.Suffix != null && (
                (p.FirstName + " " + p.MiddleName + " " + p.LastName + " " + p.Suffix).ToLower().Contains(term) ||
                (spaceNormalized.Length > 0 && (p.FirstName + " " + p.MiddleName + " " + p.LastName + " " + p.Suffix).ToLower().Contains(spaceNormalized)) ||
                (p.LastName + ", " + p.FirstName + " " + p.MiddleName + " " + p.Suffix).ToLower().Contains(term) ||
                (p.LastName + " " + p.FirstName + " " + p.MiddleName + " " + p.Suffix).ToLower().Contains(term) ||
                (spaceNormalized.Length > 0 && (p.LastName + " " + p.FirstName + " " + p.MiddleName + " " + p.Suffix).ToLower().Contains(spaceNormalized))
            )) ||

            // 6. Multi-token name matching (every token matches one of FirstName, LastName, MiddleName, or Suffix)
            (wordCount == 2 &&
                (p.FirstName.ToLower().Contains(w0) || p.LastName.ToLower().Contains(w0) || (p.MiddleName != null && p.MiddleName.ToLower().Contains(w0)) || (p.Suffix != null && p.Suffix.ToLower().Contains(w0))) &&
                (p.FirstName.ToLower().Contains(w1) || p.LastName.ToLower().Contains(w1) || (p.MiddleName != null && p.MiddleName.ToLower().Contains(w1)) || (p.Suffix != null && p.Suffix.ToLower().Contains(w1)))
            ) ||
            (wordCount == 3 &&
                (p.FirstName.ToLower().Contains(w0) || p.LastName.ToLower().Contains(w0) || (p.MiddleName != null && p.MiddleName.ToLower().Contains(w0)) || (p.Suffix != null && p.Suffix.ToLower().Contains(w0))) &&
                (p.FirstName.ToLower().Contains(w1) || p.LastName.ToLower().Contains(w1) || (p.MiddleName != null && p.MiddleName.ToLower().Contains(w1)) || (p.Suffix != null && p.Suffix.ToLower().Contains(w1))) &&
                (p.FirstName.ToLower().Contains(w2) || p.LastName.ToLower().Contains(w2) || (p.MiddleName != null && p.MiddleName.ToLower().Contains(w2)) || (p.Suffix != null && p.Suffix.ToLower().Contains(w2)))
            ) ||
            (wordCount == 4 &&
                (p.FirstName.ToLower().Contains(w0) || p.LastName.ToLower().Contains(w0) || (p.MiddleName != null && p.MiddleName.ToLower().Contains(w0)) || (p.Suffix != null && p.Suffix.ToLower().Contains(w0))) &&
                (p.FirstName.ToLower().Contains(w1) || p.LastName.ToLower().Contains(w1) || (p.MiddleName != null && p.MiddleName.ToLower().Contains(w1)) || (p.Suffix != null && p.Suffix.ToLower().Contains(w1))) &&
                (p.FirstName.ToLower().Contains(w2) || p.LastName.ToLower().Contains(w2) || (p.MiddleName != null && p.MiddleName.ToLower().Contains(w2)) || (p.Suffix != null && p.Suffix.ToLower().Contains(w2))) &&
                (p.FirstName.ToLower().Contains(w3) || p.LastName.ToLower().Contains(w3) || (p.MiddleName != null && p.MiddleName.ToLower().Contains(w3)) || (p.Suffix != null && p.Suffix.ToLower().Contains(w3)))
            ) ||
            (wordCount >= 5 &&
                (p.FirstName.ToLower().Contains(w0) || p.LastName.ToLower().Contains(w0) || (p.MiddleName != null && p.MiddleName.ToLower().Contains(w0)) || (p.Suffix != null && p.Suffix.ToLower().Contains(w0))) &&
                (p.FirstName.ToLower().Contains(w1) || p.LastName.ToLower().Contains(w1) || (p.MiddleName != null && p.MiddleName.ToLower().Contains(w1)) || (p.Suffix != null && p.Suffix.ToLower().Contains(w1))) &&
                (p.FirstName.ToLower().Contains(w2) || p.LastName.ToLower().Contains(w2) || (p.MiddleName != null && p.MiddleName.ToLower().Contains(w2)) || (p.Suffix != null && p.Suffix.ToLower().Contains(w2))) &&
                (p.FirstName.ToLower().Contains(w3) || p.LastName.ToLower().Contains(w3) || (p.MiddleName != null && p.MiddleName.ToLower().Contains(w3)) || (p.Suffix != null && p.Suffix.ToLower().Contains(w3))) &&
                (p.FirstName.ToLower().Contains(w4) || p.LastName.ToLower().Contains(w4) || (p.MiddleName != null && p.MiddleName.ToLower().Contains(w4)) || (p.Suffix != null && p.Suffix.ToLower().Contains(w4)))
            ) ||

            // 7. Philippine Healthcare & Clinic Identifiers
            p.PatientCode.ToLower().Contains(term) ||
            (unhyphenated.Length > 0 && p.PatientCode.ToLower().Replace("-", "").Contains(unhyphenated)) ||
            p.ContactNumber.Contains(term) ||
            (unhyphenated.Length > 0 && p.ContactNumber.Replace("-", "").Contains(unhyphenated)) ||
            (p.PhilHealthNumber != null && (
                p.PhilHealthNumber.ToLower().Contains(term) ||
                (unhyphenated.Length > 0 && p.PhilHealthNumber.ToLower().Contains(unhyphenated)) ||
                (unhyphenated.Length > 0 && p.PhilHealthNumber.ToLower().Replace("-", "").Contains(unhyphenated))
            )) ||
            (p.SeniorCitizenId != null && (
                p.SeniorCitizenId.ToLower().Contains(term) ||
                (unhyphenated.Length > 0 && p.SeniorCitizenId.ToLower().Replace("-", "").Contains(unhyphenated))
            )) ||
            (p.PwdId != null && (
                p.PwdId.ToLower().Contains(term) ||
                (unhyphenated.Length > 0 && p.PwdId.ToLower().Replace("-", "").Contains(unhyphenated))
            ))
        );
    }
}
