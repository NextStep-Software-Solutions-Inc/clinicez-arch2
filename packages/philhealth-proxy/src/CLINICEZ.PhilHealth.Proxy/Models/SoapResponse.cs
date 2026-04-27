namespace CLINICEZ.PhilHealth.Proxy.Models;

public record SoapResponse<T>(
    bool IsSuccess,
    T? Data,
    string? ErrorCode,
    string? ErrorMessage
);
