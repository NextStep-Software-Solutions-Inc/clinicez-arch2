using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Challenger 2 Milestone M1 Adversarial Suite:
/// Empirically verifies Edge offline deployment manifests, database init scripts (10-create-databases.sql),
/// Docker compose profiles, and install scripts (install.sh / install.ps1).
/// Validates that offline edge cells bootstrap without requiring cloud connection.
/// </summary>
public class CommsEdgeOfflineBootstrapAdversarialTests
{
    private static string FindRepoRoot()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current != null)
        {
            if (File.Exists(Path.Combine(current.FullName, "CLINICEZ.sln")))
            {
                return current.FullName;
            }
            current = current.Parent;
        }
        throw new InvalidOperationException("Could not locate repository root containing CLINICEZ.sln.");
    }

    [Fact]
    public void EdgeInitDb_10CreateDatabases_ContainsCommsDatabase()
    {
        var repoRoot = FindRepoRoot();
        var initDbPath = Path.Combine(repoRoot, "deploy", "edge", "initdb", "10-create-databases.sql");

        File.Exists(initDbPath).Should().BeTrue($"10-create-databases.sql must exist at {initDbPath}");

        var sql = File.ReadAllText(initDbPath);

        // Verify CLINICEZ_COMMS_DB is created
        sql.Should().Contain("CREATE DATABASE \"CLINICEZ_COMMS_DB\";",
            "offline edge initdb must declare CLINICEZ_COMMS_DB so comms service can start without DB creation calls");

        // Verify all 7 edge databases exist
        var requiredDbs = new[]
        {
            "CLINICEZ_CLINIC_DB",
            "CLINICEZ_BILLING_DB",
            "CLINICEZ_LABORATORY_DB",
            "CLINICEZ_PHARMACY_DB",
            "CLINICEZ_ORGANIZATION_DB",
            "CLINICEZ_COMMS_DB",
            "CLINICEZ_INTEROP_HUB_LOCAL_DB"
        };

        foreach (var db in requiredDbs)
        {
            sql.Should().Contain($"CREATE DATABASE \"{db}\";", $"Database '{db}' must be declared in initdb script");
        }
    }

    [Fact]
    public void EdgeDockerCompose_ContainsCommsApiService_WithCorrectProfileAndVolumes()
    {
        var repoRoot = FindRepoRoot();
        var composePath = Path.Combine(repoRoot, "deploy", "edge", "docker-compose.yml");

        File.Exists(composePath).Should().BeTrue($"docker-compose.yml must exist at {composePath}");

        var compose = File.ReadAllText(composePath);

        // 1. Verify comms-api service declaration
        compose.Should().Contain("comms-api:", "comms-api service must be defined in edge compose");
        compose.Should().Contain("profiles: [\"comms\"]", "comms-api must be guarded by the 'comms' compose profile");
        compose.Should().Contain("Database=CLINICEZ_COMMS_DB", "comms-api must connect to CLINICEZ_COMMS_DB");
        compose.Should().Contain("Messaging__Service: comms", "Messaging service must be set to comms");
        compose.Should().Contain("- comms-api-keys:/app/keys", "comms-api-keys volume must be mounted");

        // 2. Verify backup configuration
        compose.Should().Contain("CLINICEZ_COMMS_DB", "BACKUP_DATABASES must include CLINICEZ_COMMS_DB");
        compose.Should().Contain("- comms-api-keys:/data/keys/comms-api:ro", "backup service must mount comms-api-keys");

        // 3. Verify top-level volumes declaration
        compose.Should().Contain("comms-api-keys:", "top-level volumes must declare comms-api-keys");
    }

    [Fact]
    public void EdgeInstallScripts_ContainCommsServiceDefinitionsAndKeyGenerations()
    {
        var repoRoot = FindRepoRoot();
        var shPath = Path.Combine(repoRoot, "deploy", "edge", "install.sh");
        var psPath = Path.Combine(repoRoot, "deploy", "edge", "install.ps1");

        File.Exists(shPath).Should().BeTrue($"install.sh must exist at {shPath}");
        File.Exists(psPath).Should().BeTrue($"install.ps1 must exist at {psPath}");

        var sh = File.ReadAllText(shPath);
        var ps = File.ReadAllText(psPath);

        // install.sh assertions
        sh.Should().Contain("comms|COMMS|comms|-", "install.sh SERVICES must define comms");
        sh.Should().Contain("has_profile comms; then s=\"$s comms-api\"; fi", "install.sh must enable comms-api when comms profile active");
        sh.Should().Contain("COMMS_HUB_PUBLIC_KEY", "install.sh PUB_KEY_VARS must include comms public key");
        sh.Should().Contain("COMMS_HUB_SIGNING_KEY", "install.sh PRIV_KEY_VARS must include comms signing key");
        sh.Should().Contain("COMMS_JWT_SIGNING_KEY", "install.sh must declare COMMS_JWT_SIGNING_KEY");
        sh.Should().Contain("for svc in clinic-api billing-api laboratory-api pharmacy-api organization-api comms-api", "install.sh restore loop must include comms-api keys");
        sh.Should().Contain("extra profiles: laboratory,pharmacy,organization,cashier,comms", "install.sh help text must document comms profile");
        sh.Should().Contain("for p in laboratory pharmacy organization cashier comms; do", "install.sh interactive prompt loop must include comms profile");
        sh.Should().Contain("laboratory|pharmacy|organization|cashier|comms) ;; *) die \"Unknown profile '$p' (laboratory, pharmacy, organization, cashier, comms).\"", "install.sh decide_profiles must accept comms profile");

        // install.ps1 assertions
        ps.Should().Contain("Svc = 'comms'", "install.ps1 $Services must define comms");
        ps.Should().Contain("Profile = 'comms'", "install.ps1 comms must use 'comms' profile");
        ps.Should().Contain("Test-HasProfile 'comms'", "install.ps1 must check comms profile for enabled services");
        ps.Should().Contain("COMMS_HUB_PUBLIC_KEY", "install.ps1 must include COMMS_HUB_PUBLIC_KEY");
        ps.Should().Contain("COMMS_HUB_SIGNING_KEY", "install.ps1 must include COMMS_HUB_SIGNING_KEY");
        ps.Should().Contain("COMMS_JWT_SIGNING_KEY", "install.ps1 must include COMMS_JWT_SIGNING_KEY");
        ps.Should().Contain("clinicez-edge_${svc}-keys", "install.ps1 restore must loop over comms-api keys");
        ps.Should().Contain("-With laboratory,pharmacy,organization,cashier,comms", "install.ps1 help text must document comms profile");
        ps.Should().Contain("foreach ($p in @('laboratory', 'pharmacy', 'organization', 'cashier', 'comms'))", "install.ps1 interactive prompt loop must include comms profile");
        ps.Should().Contain("@('laboratory', 'pharmacy', 'organization', 'cashier', 'comms') -notcontains $p", "install.ps1 Select-Profiles must accept comms profile");
    }

    [Fact]
    public async Task OfflineEdgeCell_BootstrapsAndRoutesCommsEnvelopesLocally_WithoutCloudConnection()
    {
        // Spin up isolated test cell (runs an in-process local hub instance simulating edge cell)
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-offline-1", "Offline St. Jude Clinic"));

        var commsParty = Party.ForFacility(clinic.Tenant, clinic.FacilityId, FacilityType.Clinic, InteropServices.Comms);
        var clinicParty = clinic.Party;

        var clinicSdk = cell.Hub.NewSdk(InteropServices.Clinic);

        // Submit a comms message envelope from clinic to comms mailbox
        var correlationId = Guid.NewGuid();
        var submitPayload = new CommsMessageSubmitPayload(
            ClientMessageId: Guid.NewGuid(),
            ConversationId: Guid.NewGuid(),
            TenantId: clinic.Tenant,
            FacilityId: clinic.FacilityId,
            SenderType: "Staff",
            SenderId: Guid.NewGuid(),
            SenderDisplayName: "Nurse Joy",
            ContentText: "Offline triage consultation note",
            Visibility: MessageVisibility.Internal,
            RequiresAcknowledgement: false,
            Attachments: null,
            ClientSentAtUtc: DateTime.UtcNow,
            RetentionDeadlineUtc: DateTime.UtcNow.AddDays(30));

        var envelope = InteropEnvelope.Create(
            InteropTypes.CommsMessageSubmit,
            clinicParty,
            commsParty,
            correlationId,
            submitPayload);

        // Send via local SDK
        var sendResults = await clinicSdk.SendAsync([envelope], CancellationToken.None);
        sendResults.Should().ContainSingle().Which.Status.Should().Be(SendResult.Accepted);

        // Pull from comms mailbox
        var commsSdk = cell.Hub.NewSdk(InteropServices.Comms);
        var pulled = await commsSdk.PullAsync(InteropServices.Comms, max: 10, waitSeconds: 1, CancellationToken.None);

        pulled.Should().NotBeEmpty("comms service in offline edge cell must receive the local message");
        var received = pulled.FirstOrDefault(p => p.Envelope.CorrelationId == correlationId);
        received.Should().NotBeNull();
        received!.Envelope.Type.Should().Be(InteropTypes.CommsMessageSubmit);
        received.Envelope.From.Should().BeEquivalentTo(clinicParty);
        received.Envelope.To.Should().BeEquivalentTo(commsParty);

        // Acknowledge locally
        await commsSdk.AckAsync([received.DeliveryId], CancellationToken.None);
    }
}
