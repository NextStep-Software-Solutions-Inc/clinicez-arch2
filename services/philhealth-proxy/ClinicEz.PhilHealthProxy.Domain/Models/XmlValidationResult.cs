namespace ClinicEz.PhilHealthProxy.Domain.Models;

public sealed record XmlValidationError(
    int LineNumber,
    int LinePosition,
    string Message,
    bool IsWarning = false);

public sealed record XmlValidationResult(
    bool IsValid,
    IReadOnlyList<XmlValidationError> Errors)
{
    public static XmlValidationResult Success() => new(true, Array.Empty<XmlValidationError>());

    public static XmlValidationResult Failure(IReadOnlyList<XmlValidationError> errors) => new(false, errors);

    public static XmlValidationResult Failure(string message, int line = 0, int pos = 0) =>
        new(false, new[] { new XmlValidationError(line, pos, message) });
}
