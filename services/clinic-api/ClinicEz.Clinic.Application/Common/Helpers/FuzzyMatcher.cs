using System;
using System.Linq;
using System.Text;

namespace ClinicEz.Clinic.Application.Common.Helpers;

public static class FuzzyMatcher
{
    /// <summary>
    /// Computes the Levenshtein distance between two strings (case-insensitive).
    /// </summary>
    public static int LevenshteinDistance(string? s, string? t)
    {
        var str1 = s ?? string.Empty;
        var str2 = t ?? string.Empty;

        if (str1.Length == 0) return str2.Length;
        if (str2.Length == 0) return str1.Length;

        var d = new int[str1.Length + 1, str2.Length + 1];
        for (int i = 0; i <= str1.Length; i++) d[i, 0] = i;
        for (int j = 0; j <= str2.Length; j++) d[0, j] = j;

        for (int i = 1; i <= str1.Length; i++)
        {
            for (int j = 1; j <= str2.Length; j++)
            {
                int cost = char.ToLowerInvariant(str1[i - 1]) == char.ToLowerInvariant(str2[j - 1]) ? 0 : 1;
                d[i, j] = Math.Min(
                    Math.Min(d[i - 1, j] + 1, d[i, j - 1] + 1),
                    d[i - 1, j - 1] + cost);
            }
        }

        return d[str1.Length, str2.Length];
    }

    /// <summary>
    /// Computes normalized similarity ratio between 0.0 and 1.0 based on Levenshtein distance.
    /// </summary>
    public static double CalculateSimilarity(string? s, string? t)
    {
        if (string.IsNullOrWhiteSpace(s) && string.IsNullOrWhiteSpace(t)) return 1.0;
        if (string.IsNullOrWhiteSpace(s) || string.IsNullOrWhiteSpace(t)) return 0.0;

        var cleanS = NormalizeName(s);
        var cleanT = NormalizeName(t);

        if (cleanS == cleanT) return 1.0;

        int maxLen = Math.Max(cleanS.Length, cleanT.Length);
        if (maxLen == 0) return 1.0;

        int distance = LevenshteinDistance(cleanS, cleanT);
        return Math.Max(0.0, 1.0 - ((double)distance / maxLen));
    }

    /// <summary>
    /// Soundex phonetic encoding (Letter + 3 digits: Lddd).
    /// </summary>
    public static string ToSoundex(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return string.Empty;

        var letters = s.Where(char.IsLetter).ToArray();
        if (letters.Length == 0) return string.Empty;

        var clean = new string(letters).ToUpperInvariant();
        var result = new StringBuilder();
        result.Append(clean[0]);

        char prevCode = GetSoundexCode(clean[0]);

        for (int i = 1; i < clean.Length && result.Length < 4; i++)
        {
            char code = GetSoundexCode(clean[i]);
            if (code != '0' && code != prevCode)
            {
                result.Append(code);
            }
            prevCode = code;
        }

        while (result.Length < 4)
        {
            result.Append('0');
        }

        return result.ToString();
    }

    private static char GetSoundexCode(char c) => c switch
    {
        'B' or 'F' or 'P' or 'V' => '1',
        'C' or 'G' or 'J' or 'K' or 'Q' or 'S' or 'X' or 'Z' => '2',
        'D' or 'T' => '3',
        'L' => '4',
        'M' or 'N' => '5',
        'R' => '6',
        _ => '0' // A, E, I, O, U, H, W, Y
    };

    /// <summary>
    /// Normalizes Philippine phone number (strips country code +63, leading 0, returns normalized 10-digit mobile/landline).
    /// </summary>
    public static string NormalizePhone(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return string.Empty;

        var digits = new string(phone.Where(char.IsDigit).ToArray());
        if (digits.StartsWith("63") && digits.Length >= 12)
        {
            digits = digits.Substring(2);
        }

        if (digits.StartsWith("0") && digits.Length >= 11)
        {
            digits = digits.Substring(1);
        }

        return digits.Length > 10 ? digits[^10..] : digits;
    }

    /// <summary>
    /// Extracts normalized PhilHealth PIN digits (removes hyphens, spaces, and punctuation).
    /// </summary>
    public static string NormalizePhilHealthPin(string? pin)
    {
        if (string.IsNullOrWhiteSpace(pin)) return string.Empty;
        return new string(pin.Where(char.IsDigit).ToArray());
    }

    /// <summary>
    /// Normalizes names for comparison (strips punctuation, trims, collapses whitespace, lowercase).
    /// </summary>
    public static string NormalizeName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return string.Empty;

        var chars = name.Where(c => char.IsLetterOrDigit(c) || char.IsWhiteSpace(c)).ToArray();
        var words = new string(chars).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        return string.Join(" ", words).ToLowerInvariant();
    }
}
