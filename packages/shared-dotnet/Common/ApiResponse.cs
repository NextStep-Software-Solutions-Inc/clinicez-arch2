namespace ClinicEz.Shared.Common;

/// <summary>
/// A single structured error item surfaced to the client.
/// <para><c>Field</c> is null for non-field errors (e.g. 404, 409).</para>
/// <para><c>Code</c> is a machine-readable constant (e.g. REQUIRED_FIELD_MISSING).</para>
/// <para><c>Message</c> is a human-friendly string safe to show directly in the UI.</para>
/// </summary>
public sealed record ApiFieldError(string? Field, string Code, string Message);

public class ApiResponse<T>
{
    public bool Succeeded { get; set; }

    public string? Message { get; set; }

    public T? Data { get; set; }

    /// <summary>
    /// Structured error details. Always non-null on failure; empty on success.
    /// Each item has: field (nullable), code (machine-readable), message (human-friendly).
    /// </summary>
    public IReadOnlyList<ApiFieldError> Errors { get; set; } = [];

    public static ApiResponse<T> Success(T data, string? message = null)
    {
        return new ApiResponse<T> { Succeeded = true, Data = data, Message = message };
    }

    public static ApiResponse<T> Fail(
        string message,
        IReadOnlyList<ApiFieldError>? errors = null)
    {
        return new ApiResponse<T>
        {
            Succeeded = false,
            Message = message,
            Errors = errors ?? [new ApiFieldError(null, "ERROR", message)],
        };
    }
}