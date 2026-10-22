using System;

namespace ClinicEz.Shared.Common;

public static class MediatRLicense
{
    public const string DefaultKey =
        "eyJhbGciOiJSUzI1NiIsImtpZCI6Ikx1Y2t5UGVubnlTb2Z0d2FyZUxpY2Vuc2VLZXkvYmJiMTNhY2I1OTkwNGQ4OWI0Y2IxYzg1ZjA4OGNjZjkiLCJ0eXAiOiJKV1QifQ." +
        "eyJpc3MiOiJodHRwczovL2x1Y2t5cGVubnlzb2Z0d2FyZS5jb20iLCJhdWQiOiJMdWNreVBlbm55U29mdHdhcmUiLCJleHAiOiIxODIzOTA0MDAwIiwiaWF0IjoiMTc5MjQ1MjQ0NiIsImFjY291bnRfaWQiOiIwMTlmNDdiOGFhNmY3MjcwOTlmNTBmZmFhOThhNWM0MyIsImN1c3RvbWVyX2lkIjoiMDE5ZjQ3YjhhYTZmNzI3MDk5ZjUwZmZhYTk4YTVjNDMiLCJzdWJfaWQiOiItIiwiZWRpdGlvbiI6IjAiLCJ0eXBlIjoiMiJ9." +
        "2H320b3COXnxRCurbQdBM9UGmQlVP_zXUFN2-OhyowkZ9rWTQXEmXNdycRggEQOWJhFUAt4-BpKZ_aTg0wwGn6s-JS1nfYltM3ZgLdtnVUkaiWc6B3C4VLLvQTBFYOaaXw7ACnUao9JmThz2GYBQ6u40y9MKVeqEEa4OH0aB2tq481ISW8c7B_t747WXaz_CFUW47ewuOiKNUWyigrskJnwOYK_KdrPyHJiY7yLQtdA1nDMwcANRDwVuChKvjjU1cWm7waqrv97oIeYKNRNuzyWc8ZwkMd60RvB4LtBXR56yjCZ1UPJcSa2djvhSOmG2D4yzcGyWeZ992ey6OxYD6A";

    public static string Resolve()
    {
        var envKey = Environment.GetEnvironmentVariable("MediatR__LicenseKey")
            ?? Environment.GetEnvironmentVariable("MEDIATR_LICENSE_KEY");

        return !string.IsNullOrWhiteSpace(envKey) ? envKey.Trim() : DefaultKey;
    }
}
