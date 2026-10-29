using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

/// <summary>
/// The stored outcome of a mutating request that carried an <c>Idempotency-Key</c>. A client that lost the response
/// (flaky LAN, app killed mid-sync) can resend the same request with the same key and receive this stored result instead
/// of creating a duplicate patient, upload or order.
/// </summary>
public sealed class IdempotencyRecord : ClinicScopedEntity
{
    /// <summary>Who sent it (clinic + staff member), so keys never collide across users.</summary>
    public required string Scope { get; set; }

    public required string Key { get; set; }
    public required string Method { get; set; }
    public required string Path { get; set; }

    /// <summary>Fingerprint of method, path, query and body: the same key with a different request is rejected.</summary>
    public required string RequestHash { get; set; }

    public int StatusCode { get; set; }
    public string? ContentType { get; set; }
    public string? ResponseBody { get; set; }
}
