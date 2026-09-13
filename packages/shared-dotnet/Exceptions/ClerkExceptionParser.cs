using System.Text.Json;
using CLINICEZ.Shared.Exceptions;

namespace CLINICEZ.Shared.Exceptions;

public static class ClerkExceptionParser
{
    /// <summary>
    /// Attempts to parse and unwrap generic Clerk SDK exceptions into clean application exceptions.
    /// Returns the unwrapped exception if successful, otherwise returns the original exception.
    /// </summary>
    public static Exception TryUnwrap(Exception exception)
    {
        if (exception is null)
            throw new ArgumentNullException(nameof(exception));

        if (string.IsNullOrWhiteSpace(exception.Message))
            return exception;

        if (exception.Message.Contains("API error occurred. Body: "))
        {
            try
            {
                var bodyStr = exception.Message.Substring(exception.Message.IndexOf("Body: ") + 6).TrimEnd('.');
                var root = JsonDocument.Parse(bodyStr);
                if (root.RootElement.TryGetProperty("errors", out var errorsObj) && errorsObj.GetArrayLength() > 0)
                {
                    var firstErrObj = errorsObj[0];
                    var errorMsg = firstErrObj.TryGetProperty("long_message", out var longMsgProp) && !string.IsNullOrWhiteSpace(longMsgProp.GetString())
                        ? longMsgProp.GetString()
                        : firstErrObj.GetProperty("message").GetString();

                    if (!string.IsNullOrWhiteSpace(errorMsg))
                    {
                        return new BadRequestException(errorMsg);
                    }
                }
            }
            catch 
            { 
                // Ignore parsing errors and return original exception
            }
        }

        return exception;
    }
}
