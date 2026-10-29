using System;
using System.Net;
using System.Net.Sockets;

namespace ClinicEz.Clinic.Application.Common.Security;

public static class SafeDownloadUrlValidator
{
    public const int MaxUrlLength = 2048;

    public static bool TryValidateSafeHttpsUrl(string? rawUrl, out Uri uri, out string failureReason)
    {
        uri = null!;
        failureReason = string.Empty;

        if (string.IsNullOrWhiteSpace(rawUrl))
        {
            failureReason = "URL is null or empty.";
            return false;
        }

        if (rawUrl.Length > MaxUrlLength)
        {
            failureReason = $"URL exceeds maximum length of {MaxUrlLength} characters.";
            return false;
        }

        if (!Uri.TryCreate(rawUrl.Trim(), UriKind.Absolute, out var parsed))
        {
            failureReason = "Invalid absolute URL.";
            return false;
        }

        // Scheme must be strictly HTTPS
        if (parsed.Scheme != Uri.UriSchemeHttps)
        {
            failureReason = $"Scheme '{parsed.Scheme}' is not allowed. Only HTTPS is permitted.";
            return false;
        }

        if (!string.IsNullOrEmpty(parsed.UserInfo))
        {
            failureReason = "URLs with user info credentials are not permitted.";
            return false;
        }

        var host = parsed.IdnHost.Trim().TrimEnd('.').ToLowerInvariant();

        // Prohibit localhost and local domain names
        if (host == "localhost" ||
            host.EndsWith(".localhost", StringComparison.Ordinal) ||
            host.EndsWith(".local", StringComparison.Ordinal) ||
            host.EndsWith(".internal", StringComparison.Ordinal) ||
            host.EndsWith(".lan", StringComparison.Ordinal) ||
            host.EndsWith(".corp", StringComparison.Ordinal))
        {
            failureReason = $"Host '{host}' is prohibited by SSRF security policy.";
            return false;
        }

        // Dotless hostnames are internal private names
        if (!host.Contains('.') && !host.Contains(':'))
        {
            failureReason = $"Dotless host '{host}' is prohibited by SSRF security policy.";
            return false;
        }

        // Check if literal IP address
        if (IPAddress.TryParse(host.Trim('[', ']'), out var ip))
        {
            if (IsPrivateOrReserved(ip))
            {
                failureReason = $"IP address '{ip}' is in a private or reserved range and is prohibited by SSRF security policy.";
                return false;
            }
        }

        uri = parsed;
        return true;
    }

    public static bool IsPrivateOrReserved(IPAddress ip)
    {
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        if (IPAddress.IsLoopback(ip)) return true;

        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
        {
            return ip.IsIPv6LinkLocal ||
                   ip.IsIPv6SiteLocal ||
                   ip.IsIPv6Multicast ||
                   ip.Equals(IPAddress.IPv6Any) ||
                   (ip.GetAddressBytes()[0] & 0xFE) == 0xFC; // fc00::/7 unique-local
        }

        var b = ip.GetAddressBytes();
        return b[0] == 0 ||                                    // 0.0.0.0/8
               b[0] == 10 ||                                   // 10.0.0.0/8 (RFC 1918)
               (b[0] == 100 && b[1] >= 64 && b[1] <= 127) ||   // 100.64.0.0/10 (CGNAT)
               b[0] == 127 ||                                  // 127.0.0.0/8 (Loopback)
               (b[0] == 169 && b[1] == 254) ||                 // 169.254.0.0/16 (Link-local / Cloud metadata)
               (b[0] == 172 && b[1] >= 16 && b[1] <= 31) ||    // 172.16.0.0/12 (RFC 1918)
               (b[0] == 192 && b[1] == 168) ||                 // 192.168.0.0/16 (RFC 1918)
               (b[0] == 198 && (b[1] == 18 || b[1] == 19)) ||  // 198.18.0.0/15 (Benchmarking)
               b[0] >= 224;                                    // Multicast / Reserved (224.0.0.0+)
    }
}
