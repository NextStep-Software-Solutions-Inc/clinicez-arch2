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
}
