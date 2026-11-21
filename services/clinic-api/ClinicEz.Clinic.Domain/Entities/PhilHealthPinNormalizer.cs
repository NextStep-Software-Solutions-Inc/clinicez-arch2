using System;

namespace ClinicEz.Clinic.Domain.Entities;

/// <summary>
/// Normalizes and validates PhilHealth Identification Numbers (PIN).
/// Ensures deterministic 12-digit PIN representations across hyphens, spaces, and padding,
/// while strictly rejecting unassigned/all-zero placeholders (e.g. "00-000000000-0", "000000000000").
/// </summary>
public static class PhilHealthPinNormalizer
{
    /// <summary>
    /// Normalizes a PhilHealth Identification Number (PIN) to a standard 12-digit string.
    /// Handles hyphens, spaces, whitespace, and leading zeros.
    /// Returns null if input is null/empty, contains no digits, or consists entirely of zeros.
    /// </summary>
    public static string? Normalize(string? rawPin)
    {
        if (string.IsNullOrWhiteSpace(rawPin))
        {
            return null;
        }

        Span<char> buffer = stackalloc char[rawPin.Length];
        int digitCount = 0;
        bool hasNonZero = false;

        foreach (var ch in rawPin)
        {
            if (char.IsDigit(ch))
            {
                buffer[digitCount++] = ch;
                if (ch != '0')
                {
                    hasNonZero = true;
                }
            }
        }

        if (digitCount == 0 || !hasNonZero)
        {
            return null;
        }

        string digits = new string(buffer[..digitCount]);

        if (digitCount == 12)
        {
            return digits;
        }

        if (digitCount < 12)
        {
            return digits.PadLeft(12, '0');
        }

        // If longer than 12 digits, take last 12 digits
        return digits[^12..];
    }

    /// <summary>
    /// Determines whether the provided PIN is valid and can be normalized to a genuine 12-digit PIN.
    /// </summary>
    public static bool IsValidPin(string? pin)
    {
        return Normalize(pin) != null;
    }

    private static readonly int[] Mod11Weights = [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

    /// <summary>
    /// Formats a 12-digit PIN as XX-XXXXXXXXX-X when 12 digits are present.
    /// </summary>
    public static string FormatHyphenated(string? rawPin)
    {
        var digits = ExtractExactDigits(rawPin);
        if (digits.Length == 12)
        {
            return $"{digits[..2]}-{digits[2..11]}-{digits[11]}";
        }
        return rawPin?.Trim() ?? string.Empty;
    }

    /// <summary>
    /// Strictly validates that the PIN contains exactly 12 non-zero-only digits and passes
    /// the RA 11223 Modulus-11 check digit sequence.
    /// </summary>
    public static bool IsValidMod11Pin(string? rawPin)
    {
        var digits = ExtractExactDigits(rawPin);
        if (digits.Length != 12)
        {
            return false;
        }

        bool hasNonZero = false;
        for (int i = 0; i < 12; i++)
        {
            if (digits[i] != '0')
            {
                hasNonZero = true;
                break;
            }
        }
        if (!hasNonZero)
        {
            return false;
        }

        int sum = 0;
        for (int i = 0; i < 11; i++)
        {
            sum += (digits[i] - '0') * Mod11Weights[i];
        }

        int remainder = sum % 11;
        int expectedCheckDigit = (11 - remainder) % 11;
        if (expectedCheckDigit == 10)
        {
            expectedCheckDigit = 0;
        }

        int actualCheckDigit = digits[11] - '0';
        return actualCheckDigit == expectedCheckDigit;
    }

    private static string ExtractExactDigits(string? rawPin)
    {
        if (string.IsNullOrWhiteSpace(rawPin))
        {
            return string.Empty;
        }

        Span<char> buffer = stackalloc char[rawPin.Length];
        int count = 0;
        foreach (var ch in rawPin)
        {
            if (char.IsDigit(ch))
            {
                buffer[count++] = ch;
            }
        }

        return count == 0 ? string.Empty : new string(buffer[..count]);
    }
}
