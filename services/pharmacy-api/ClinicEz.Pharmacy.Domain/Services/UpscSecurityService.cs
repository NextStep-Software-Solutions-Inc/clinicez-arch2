using System;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace ClinicEz.Pharmacy.Domain.Services;

public sealed partial class UpscSecurityService : IUpscSecurityService
{
    private static readonly Regex UpscPattern = GenerateUpscRegex();

    public string GenerateUpsc(
        string hciAccreditationNumber,
        string patientPin,
        string prescriptionNumber,
        string doctorPrcLicense,
        string drugCode,
        int quantity,
        DateTime issueDate,
        string secretKey = "ClinicEzPhilHealthGamotSecretKey")
    {
        var cleanAccre = NormalizeAlphanumeric(hciAccreditationNumber, "00000");
        var cleanPin = NormalizePin(patientPin);
        var cleanRxNo = (prescriptionNumber ?? string.Empty).Trim().ToUpperInvariant();
        var cleanPrc = (doctorPrcLicense ?? string.Empty).Trim().ToUpperInvariant();
        var cleanDrug = (drugCode ?? string.Empty).Trim().ToUpperInvariant();
        var datePart = issueDate.ToString("yyyyMMdd");

        var payload = $"{cleanAccre}:{cleanPin}:{cleanRxNo}:{cleanPrc}:{cleanDrug}:{quantity}:{datePart}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(string.IsNullOrEmpty(secretKey) ? "ClinicEzPhilHealthGamotSecretKey" : secretKey));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
        var token = Convert.ToHexString(hash)[..6];

        var body = $"UPSC-{cleanAccre}-{datePart}-{token}";
        var checkDigit = ComputeMod11CheckDigit(body);

        return $"{body}-{checkDigit}";
    }

    public bool ValidateUpsc(
        string upsc,
        string hciAccreditationNumber,
        string patientPin,
        string prescriptionNumber,
        string doctorPrcLicense,
        string drugCode,
        int quantity,
        DateTime issueDate,
        string secretKey = "ClinicEzPhilHealthGamotSecretKey")
    {
        if (string.IsNullOrWhiteSpace(upsc))
            return false;

        if (!VerifyChecksum(upsc))
            return false;

        var expectedUpsc = GenerateUpsc(
            hciAccreditationNumber,
            patientPin,
            prescriptionNumber,
            doctorPrcLicense,
            drugCode,
            quantity,
            issueDate,
            secretKey);

        return string.Equals(upsc.Trim(), expectedUpsc, StringComparison.OrdinalIgnoreCase);
    }

    public bool VerifyChecksum(string upsc)
    {
        if (string.IsNullOrWhiteSpace(upsc))
            return false;

        var trimmed = upsc.Trim().ToUpperInvariant();
        if (!UpscPattern.IsMatch(trimmed))
            return false;

        var lastHyphenIndex = trimmed.LastIndexOf('-');
        if (lastHyphenIndex <= 0 || lastHyphenIndex == trimmed.Length - 1)
            return false;

        var body = trimmed[..lastHyphenIndex];
        var givenCheckDigit = trimmed[(lastHyphenIndex + 1)..];

        var expectedCheckDigit = ComputeMod11CheckDigit(body);
        return string.Equals(givenCheckDigit, expectedCheckDigit, StringComparison.OrdinalIgnoreCase);
    }

    private static string ComputeMod11CheckDigit(string input)
    {
        int sum = 0;
        int weight = 2;

        for (int i = input.Length - 1; i >= 0; i--)
        {
            sum += (int)input[i] * weight;
            weight++;
            if (weight > 7)
                weight = 2;
        }

        int remainder = sum % 11;
        int checkDigitVal = (11 - remainder) % 11;

        return checkDigitVal switch
        {
            10 => "X",
            _ => checkDigitVal.ToString()
        };
    }

    private static string NormalizeAlphanumeric(string? input, string fallback)
    {
        if (string.IsNullOrWhiteSpace(input))
            return fallback;

        var chars = input.Where(char.IsLetterOrDigit).ToArray();
        return chars.Length > 0 ? new string(chars).ToUpperInvariant() : fallback;
    }

    private static string NormalizePin(string? pin)
    {
        if (string.IsNullOrWhiteSpace(pin))
            return "000000000000";

        var digits = new string(pin.Where(char.IsDigit).ToArray());
        return digits.PadLeft(12, '0');
    }

    [GeneratedRegex(@"^UPSC-[A-Z0-9]+-\d{8}-[A-Z0-9]{6}-[0-9X]$", RegexOptions.IgnoreCase)]
    private static partial Regex GenerateUpscRegex();
}
