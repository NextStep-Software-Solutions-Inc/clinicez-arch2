using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using ClinicEz.Clinic.Application.Features.Yakap.WireBuilders;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Architecture;

public sealed class ModularMonolithArchitectureTests
{
    [Fact]
    public void NonYakapFeatures_MustNotReference_FeaturesYakapDirectly()
    {
        // Arrange: locate the Application Features directory
        var baseDir = AppContext.BaseDirectory;
        // Search upwards to find services/clinic-api/ClinicEz.Clinic.Application/Features
        var currentDir = new DirectoryInfo(baseDir);
        DirectoryInfo? featuresDir = null;

        while (currentDir != null)
        {
            var candidate = Path.Combine(currentDir.FullName, "services", "clinic-api", "ClinicEz.Clinic.Application", "Features");
            if (Directory.Exists(candidate))
            {
                featuresDir = new DirectoryInfo(candidate);
                break;
            }
            currentDir = currentDir.Parent;
        }

        featuresDir.Should().NotBeNull("Features directory must be resolvable from test run directory.");

        // Find all .cs files outside Features/Yakap
        var files = featuresDir!.GetFiles("*.cs", SearchOption.AllDirectories)
            .Where(f => !f.FullName.Contains(Path.Combine("Features", "Yakap")))
            .ToList();

        files.Should().NotBeEmpty("There should be clinical feature files to evaluate.");

        var forbiddenRegex = new Regex(@"^\s*using\s+ClinicEz\.Clinic\.Application\.Features\.Yakap", RegexOptions.Multiline);
        var violations = (from file in files
            let content = File.ReadAllText(file.FullName)
            where forbiddenRegex.IsMatch(content)
            select file.FullName).ToList();

        // Assert
        violations.Should().BeEmpty(
            "Modular Monolith Invariant: Features outside of Features/Yakap must NOT directly reference Features.Yakap. " +
            "Found inward references in: " + string.Join(", ", violations));
    }

    [Fact]
    public void AllFiveWireBuilders_ImplementCanonicalInterface()
    {
        // Assert that all 5 PCAPI v2.0 wire builders exist and implement IYakapWireBuilder
        typeof(YakapFpeWireBuilder).GetInterfaces().Should().Contain(i => i.Name.StartsWith("IYakapWireBuilder"));
        typeof(YakapConsultationWireBuilder).GetInterfaces().Should().Contain(i => i.Name.StartsWith("IYakapWireBuilder"));
        typeof(YakapDiagnosticRequestWireBuilder).GetInterfaces().Should().Contain(i => i.Name.StartsWith("IYakapWireBuilder"));
        typeof(YakapDiagnosticResultsWireBuilder).GetInterfaces().Should().Contain(i => i.Name.StartsWith("IYakapWireBuilder"));
        typeof(YakapMedicineWireBuilder).GetInterfaces().Should().Contain(i => i.Name.StartsWith("IYakapWireBuilder"));
    }
}
