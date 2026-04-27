namespace CLINICEZ.PhilHealth.Proxy.Common;

public sealed class ApiResponse<T>
{
    public bool Success { get; init; }
    public T? Data { get; init; }
    public IReadOnlyList<ApiError> Errors { get; init; } = [];
    public string? TraceId { get; init; }

    public static ApiResponse<T> Ok(T data, string? traceId = null) =>
        new() { Success = true, Data = data, TraceId = traceId };

    public static ApiResponse<T> Fail(IReadOnlyList<ApiError> errors, string? traceId = null) =>
        new() { Success = false, Errors = errors, TraceId = traceId };

    public static ApiResponse<T> Fail(string code, string message, string? traceId = null) =>
        Fail([new ApiError(code, message)], traceId);
}

public sealed record ApiError(string Code, string Message, string? Field = null);
