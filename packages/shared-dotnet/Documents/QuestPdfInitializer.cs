using System.Reflection;
using QuestPDF.Drawing;
using QuestPDF.Infrastructure;

namespace ClinicEz.Shared.Documents;

public static class QuestPdfInitializer
{
    private static bool _initialized = false;
    private static readonly object _lock = new();

    public static void EnsureInitialized()
    {
        if (_initialized) return;
        lock (_lock)
        {
            if (!_initialized)
            {
                QuestPDF.Settings.License = LicenseType.Community;

                try
                {
                    var assembly = typeof(QuestPdfInitializer).Assembly;
                    RegisterEmbeddedFont(assembly, "ClinicEz.Shared.Documents.Fonts.Geist-Regular.ttf");
                    RegisterEmbeddedFont(assembly, "ClinicEz.Shared.Documents.Fonts.Geist-Medium.ttf");
                    RegisterEmbeddedFont(assembly, "ClinicEz.Shared.Documents.Fonts.Geist-SemiBold.ttf");
                    RegisterEmbeddedFont(assembly, "ClinicEz.Shared.Documents.Fonts.Geist-Bold.ttf");
                }
                catch
                {
                    // Fallback to system fonts if custom font loading encounters an issue
                }

                _initialized = true;
            }
        }
    }

    private static void RegisterEmbeddedFont(Assembly assembly, string resourceName)
    {
        using var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream != null)
        {
            FontManager.RegisterFont(stream);
        }
    }
}
