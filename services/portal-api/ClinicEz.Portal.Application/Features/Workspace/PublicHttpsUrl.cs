using System;
using System.Net;
using System.Net.Sockets;

namespace ClinicEz.Portal.Application.Features.Workspace;

/// <summary>
/// Shared rule for user-supplied URLs the platform renders or calls (brand logo, privacy notice,
/// webhook targets): absolute https, no embedded credentials, and no loopback / private /
/// link-local literal hosts. Hostnames are additionally resolved and re-checked at call time
/// by components that make outbound requests (webhooks).
/// </summary>
public static class PublicHttpsUrl
{
    public const int MaxLength = 2048;

    public static bool IsValid(string? value) => TryParse(value, out _);

    public static bool TryParse(string? value, out Uri uri)
    {
        uri = null!;
        if (string.IsNullOrWhiteSpace(value) || value.Length > MaxLength) return false;
        if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var parsed)) return false;
        if (parsed.Scheme != Uri.UriSchemeHttps) return false;
        if (!string.IsNullOrEmpty(parsed.UserInfo)) return false;
        if (IsBlockedHost(parsed.IdnHost)) return false;

        uri = parsed;
        return true;
    }

    public static bool IsBlockedHost(string host)
    {
        if (string.IsNullOrWhiteSpace(host)) return true;

        var h = host.Trim().TrimEnd('.').ToLowerInvariant();
        if (h == "localhost" || h.EndsWith(".localhost", StringComparison.Ordinal) ||
            h.EndsWith(".local", StringComparison.Ordinal) || h.EndsWith(".internal", StringComparison.Ordinal))
            return true;

        // A dotless hostname can only resolve inside a private network.
        if (!h.Contains('.') && !h.Contains(':')) return true;

        return IPAddress.TryParse(h.Trim('[', ']'), out var ip) && IsPrivateOrReserved(ip);
    }

    public static bool IsPrivateOrReserved(IPAddress ip)
    {
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        if (IPAddress.IsLoopback(ip)) return true;

        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
        {
            return ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || ip.IsIPv6Multicast ||
                   ip.Equals(IPAddress.IPv6Any) || (ip.GetAddressBytes()[0] & 0xFE) == 0xFC; // fc00::/7 unique-local
        }

        var b = ip.GetAddressBytes();
        return b[0] == 0 ||                                   // 0.0.0.0/8
               b[0] == 10 ||                                  // 10.0.0.0/8
               (b[0] == 100 && b[1] >= 64 && b[1] <= 127) ||  // 100.64.0.0/10 CGNAT
               b[0] == 127 ||                                 // loopback
               (b[0] == 169 && b[1] == 254) ||                // link-local / cloud metadata
               (b[0] == 172 && b[1] >= 16 && b[1] <= 31) ||   // 172.16.0.0/12
               (b[0] == 192 && b[1] == 168) ||                // 192.168.0.0/16
               b[0] >= 224;                                   // multicast / reserved
    }
}
