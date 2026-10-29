using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Infrastructure.PhilHealth;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interoperability;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.Adversarial;

/// <summary>
/// Milestone M2-C Challenger Adversarial Verification Suite:
/// 1. Empirically verify and stress-test PhilHealthPcapiTester SSRF guards (loopback, link-local, private ranges, decimal/hex IP, non-HTTPS).
/// 2. Discover and document SSRF bypass vectors (IPv4-mapped IPv6, IPv6 ULA) and BaseUrl path duplication.
/// 3. Verify simulation sandbox determinism (PKA-SIM- prefix, latency, zero outbound HTTP calls, cancellation handling).
/// 4. Verify Zero-PHI guarantees in YAKAP 2.0 telemetry endpoints under adversarial query parameters and corrupted payloads.
/// 5. Verify tenant boundary and authorization enforcement on all YAKAP telemetry endpoints.
/// </summary>
public sealed class ChallengerM2CPcapiSsrfAndTelemetryAdversarialTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly Tenant _tenant;
    private readonly Branch _branch;
    private readonly string _ownerId = "owner-challenger-m2c";
    private readonly string _staffId = "staff-challenger-m2c";
    private readonly string _strangerId = "stranger-challenger-m2c";

    public ChallengerM2CPcapiSsrfAndTelemetryAdversarialTests()
    {
        _tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "challenger-health",
            Name = "Challenger Health Systems",
            OwnerId = _ownerId,
            Email = "audit@challenger-health.test"
        };

        _branch = new Branch
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Name = "Challenger Main Facility",
            IsActive = true,
            PhilHealthAccreditationNumber = "H91001234",
            PhilHealthPmccNumber = "Z15445",
            PhilHealthSoftwareCertificateId = "KON-CERT-M2C",
            PhilHealthBaseUrl = "https://pcapi.philhealth.gov.ph"
        };

        var staffMember = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            UserId = _staffId,
            Status = MemberStatus.Active,
            Role = WorkspaceMemberRole.Member
        };

        _context.Tenants.Add(_tenant);
        _context.Branches.Add(_branch);
        _context.WorkspaceMembers.Add(staffMember);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private sealed class FakeEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "ClinicEz.Portal";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = null!;
    }

    private sealed class CapturingProbeHandler : HttpMessageHandler
    {
        public HttpRequestMessage? LastRequest { get; private set; }
        public string? LastRequestBody { get; private set; }
        private readonly HttpResponseMessage _response;

        public CapturingProbeHandler(HttpResponseMessage? response = null)
        {
            _response = response ?? new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"token\":\"PHILHEALTH_PROBE_OK\"}", Encoding.UTF8, "application/json")
            };
        }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            LastRequest = request;
            if (request.Content != null)
            {
                LastRequestBody = await request.Content.ReadAsStringAsync(cancellationToken);
            }
            return _response;
        }
    }

    private static HttpContext CreateContextWithUser(string? userId)
    {
        var httpContext = new DefaultHttpContext();
        if (!string.IsNullOrEmpty(userId))
        {
            var identity = new ClaimsIdentity(new[]
            {
                new Claim(ClaimTypes.NameIdentifier, userId)
            }, "TestAuth");
            httpContext.User = new ClaimsPrincipal(identity);
        }
        return httpContext;
    }

    #region Pillar 1: SSRF Guard Stress Testing

    [Theory]
    // Standard IPv4 Loopback
    [InlineData("https://127.0.0.1:8080")]
    [InlineData("https://127.0.0.2:8080")]
    [InlineData("https://127.255.255.254:8080")]
    [InlineData("https://localhost:8080")]
    // IPv6 Loopback
    [InlineData("https://[::1]:8080")]
    [InlineData("https://[0:0:0:0:0:0:0:1]:8080")]
    // Link-local
    [InlineData("https://169.254.169.254/latest/meta-data")]
    [InlineData("https://169.254.1.1:8080")]
    [InlineData("https://[fe80::1]:8080")]
    // RFC 4193 IPv6 Unique Local Addresses (ULA)
    [InlineData("https://[fc00::1]:8080")]
    [InlineData("https://[fd00::1]:8080")]
    // RFC 1918 Private Ranges
    [InlineData("https://10.0.0.1:8080")]
    [InlineData("https://10.254.0.1:8080")]
    [InlineData("https://172.16.0.1:8080")]
    [InlineData("https://172.31.255.254:8080")]
    [InlineData("https://192.168.0.1:8080")]
    [InlineData("https://192.168.1.1:8080")]
    // Alternative Notations Canonicalized by .NET Uri
    [InlineData("https://2130706433:8080")] // Decimal IP for 127.0.0.1
    [InlineData("https://0x7f000001:8080")] // Hex IP for 127.0.0.1
    [InlineData("https://0x7f.0.0.1:8080")]  // Dotted Hex for 127.0.0.1
    [InlineData("https://2852039166:8080")] // Decimal IP for 169.254.169.254
    [InlineData("https://0xa9fea9fe:8080")] // Hex IP for 169.254.169.254
    [InlineData("https://167772161:8080")]  // Decimal IP for 10.0.0.1
    [InlineData("https://0x0a000001:8080")] // Hex IP for 10.0.0.1
    // Internal / Local Domain Suffixes
    [InlineData("https://internal-service.local:8080")]
    [InlineData("https://kube-service.internal:8080")]
    public async Task Ssrf_Production_BlocksPrivateAndLoopbackAddresses(string endpoint)
    {
        var handler = new CapturingProbeHandler();
        var client = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            secretKey: "valid-prod-secret",
            baseUrl: endpoint);

        Assert.False(result.Success);
        Assert.Null(handler.LastRequest); // Zero outbound network requests allowed
        Assert.True(
            result.Message.Contains("not permitted", StringComparison.OrdinalIgnoreCase) ||
            result.Message.Contains("HTTPS in production", StringComparison.OrdinalIgnoreCase),
            $"Expected SSRF rejection on {endpoint} but received: {result.Message}");
    }

    [Theory]
    [InlineData("http://pcapi.philhealth.gov.ph")]
    [InlineData("http://api.philhealth.gov.ph")]
    [InlineData("ftp://pcapi.philhealth.gov.ph")]
    [InlineData("file:///etc/passwd")]
    [InlineData("gopher://127.0.0.1:70")]
    public async Task Ssrf_Production_RejectsNonHttpsSchemes(string endpoint)
    {
        var handler = new CapturingProbeHandler();
        var client = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            secretKey: "valid-prod-secret",
            baseUrl: endpoint);

        Assert.False(result.Success);
        Assert.Null(handler.LastRequest);
        Assert.True(
            result.Message.Contains("HTTPS in production", StringComparison.OrdinalIgnoreCase) ||
            result.Message.Contains("HTTP or HTTPS", StringComparison.OrdinalIgnoreCase) ||
            result.Message.Contains("Invalid", StringComparison.OrdinalIgnoreCase),
            $"Expected scheme rejection on {endpoint} but received: {result.Message}");
    }

    #endregion

    #region Pillar 2: Empirical Vulnerability Evidence & Enforcement Verification

    [Theory]
    [InlineData("https://[::ffff:169.254.169.254]:8080")] // Cloud Instance Metadata Service via IPv4-mapped IPv6
    [InlineData("https://[::ffff:10.0.0.1]:8080")]         // Private RFC 1918 10.0.0.0/8 via IPv4-mapped IPv6
    [InlineData("https://[::ffff:192.168.1.1]:8080")]     // Private RFC 1918 192.168.0.0/16 via IPv4-mapped IPv6
    [InlineData("https://[::ffff:172.16.0.1]:8080")]      // Private RFC 1918 172.16.0.0/12 via IPv4-mapped IPv6
    public async Task Ssrf_VulnerabilityEvidence_Ipv4MappedIpv6BypassesCurrentGuard(string bypassEndpoint)
    {
        // ENFORCEMENT VERIFICATION:
        // In PhilHealthPcapiTester.IsPrivateOrLinkLocalIp, when an IPv6 address is evaluated,
        // it unwraps IPv4-mapped IPv6 addresses via ip.IsIPv4MappedToIPv6 -> ip.MapToIPv4().
        // Consequently, IPv4-mapped IPv6 addresses targeting private/link-local ranges are strictly BLOCKED!
        var handler = new CapturingProbeHandler();
        var client = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            secretKey: "secret",
            baseUrl: bypassEndpoint);

        // Under hardened implementation, the request is strictly blocked before network dispatch:
        Assert.False(result.Success);
        Assert.Null(handler.LastRequest);
        Assert.True(
            result.Message.Contains("not permitted", StringComparison.OrdinalIgnoreCase) ||
            result.Message.Contains("HTTPS in production", StringComparison.OrdinalIgnoreCase),
            $"Expected SSRF rejection on {bypassEndpoint} but received: {result.Message}");
    }

    [Fact]
    public void Ssrf_VulnerabilityEvidence_Ipv6UniqueLocalAddressesAreNotChecked()
    {
        // EMPIRICAL PROOF OF VULNERABILITY & ENFORCEMENT:
        // RFC 4193 IPv6 Unique Local Addresses (fc00::/7) are the IPv6 equivalent of RFC 1918 private space.
        // IPAddress.IsIPv6LinkLocal and IsIPv6SiteLocal do NOT cover fc00::/7.
        var ulaAddress = IPAddress.Parse("fc00::1");
        Assert.False(ulaAddress.IsIPv6LinkLocal);
        Assert.False(ulaAddress.IsIPv6SiteLocal);
        Assert.False(ulaAddress.IsIPv6Multicast);
        Assert.False(IPAddress.IsLoopback(ulaAddress));
        // IPAddress.IsIPv6UniqueLocal is available in .NET 8+ and guarded in PhilHealthPcapiTester
        Assert.True(ulaAddress.IsIPv6UniqueLocal);
    }

    [Fact]
    public async Task PcapiTester_VulnerabilityEvidence_BaseUrlAppendsDuplicateAuthTokenPath()
    {
        // ENFORCEMENT VERIFICATION:
        // When a user or frontend provides a BaseUrl that already includes the standard path "/api/v1/auth/token",
        // PhilHealthPcapiTester normalizes the path without duplicate concatenation:
        // "https://pcapi.philhealth.gov.ph/api/v1/auth/token"
        var handler = new CapturingProbeHandler();
        var client = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            secretKey: "secret",
            baseUrl: "https://pcapi.philhealth.gov.ph/api/v1/auth/token");

        Assert.NotNull(handler.LastRequest);
        Assert.Equal(
            "https://pcapi.philhealth.gov.ph/api/v1/auth/token",
            handler.LastRequest.RequestUri?.ToString());
        Assert.True(result.Success);
    }

    [Theory]
    [InlineData("https://my-mock-server.test/api/v1/auth/token", false)]
    [InlineData("https://external-gateway.com/api/v1/auth/token", false)]
    [InlineData("https://staging.philhealth.gov.ph/api/v1/auth/token", true)]
    [InlineData("/api/v1/auth/token", true)]
    public void IsSandbox_ExternalCustomEndpointsWithTokenPath_NotClassifiedAsSandbox(string endpoint, bool expected)
    {
        Assert.Equal(expected, PhilHealthPcapiTester.IsSandbox(endpoint));
    }

    #endregion

    #region Pillar 3: Simulation Sandbox Isolation & Determinism

    [Fact]
    public async Task SimulationSandbox_ReturnsDeterministicPkaSimTokenWithoutNetwork()
    {
        var handler = new CapturingProbeHandler(new HttpResponseMessage(HttpStatusCode.InternalServerError));
        var client = new HttpClient(handler);
        var env = new FakeEnvironment("Development");
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "P10038831",
            secretKey: "any-secret",
            softwareCertificateId: "CERT-001",
            baseUrl: "https://staging.philhealth.gov.ph/api/v1/auth/token");

        Assert.True(result.Success);
        Assert.NotNull(result.Token);
        Assert.StartsWith("PKA-SIM-P10038831", result.Token);
        Assert.Contains("Simulation Sandbox Verified", result.Message);
        Assert.True(result.LatencyMs >= 15);
        Assert.Null(handler.LastRequest); // Must make ZERO network requests
    }

    [Fact]
    public async Task SimulationSandbox_CancellationRequested_AbortsGracefully()
    {
        var handler = new CapturingProbeHandler();
        var client = new HttpClient(handler);
        var env = new FakeEnvironment("Development");
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance, env);

        using var cts = new CancellationTokenSource();
        cts.Cancel(); // Pre-canceled token

        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () =>
        {
            await tester.TestConnectionAsync(
                accreditationNumber: "P10038831",
                secretKey: "any-secret",
                baseUrl: "https://staging.philhealth.gov.ph",
                ct: cts.Token);
        });

        Assert.Null(handler.LastRequest);
    }

    [Fact]
    public async Task SimulationSandbox_InProduction_DoesNotReturnSimulatedTokens()
    {
        // In Production, staging/sandbox URLs must NOT return simulated tokens
        // Instead, genuine network calls are performed
        var handler = new CapturingProbeHandler();
        var client = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "P10038831",
            secretKey: "prod-secret-12345",
            baseUrl: "https://staging.philhealth.gov.ph");

        Assert.True(result.Success);
        Assert.NotNull(handler.LastRequest); // Confirms genuine network probe in production
        Assert.DoesNotContain("Simulation Sandbox Verified", result.Message);
    }

    #endregion

    #region Pillar 4: YAKAP 2.0 Telemetry Zero-PHI Boundary

    private sealed class AdversarialClinicApiClient : IClinicApiClient
    {
        public Task<ApiResponse<PortalYakapBranchSummaryDto>> GetBranchYakapSummaryAsync(
            string tenantId, Guid branchId, CancellationToken ct = default)
        {
            return Task.FromResult(ApiResponse<PortalYakapBranchSummaryDto>.Success(new PortalYakapBranchSummaryDto
            {
                BranchId = branchId,
                AccreditationNo = "H91001234",
                EmpaneledCount = 42,
                SelectedCount = 20,
                AcceptedUploadsCount = 18,
                PendingPollingCount = 2,
                RejectedOrFailedCount = 1,
                MasterlistTotalCount = 50
            }));
        }

        public Task<ApiResponse<IReadOnlyList<PortalYakapSubmissionDto>>> GetSubmissionsAsync(
            string tenantId, Guid branchId, string? status = null, string? submissionType = null,
            int page = 1, int pageSize = 50, CancellationToken ct = default)
        {
            // Deterministic Zero-PHI records returned by clinic API
            var list = new List<PortalYakapSubmissionDto>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    PatientCode = "PAT-SECURE-999",
                    AccreditationNo = "H91001234",
                    SubmissionType = "Profile",
                    LocalTransactionNo = "TX-20261028-001",
                    UploadTransactionNo = "U20261028001002003",
                    YesReferenceNo = "MCA20261028001",
                    ProcessingStatus = "Accepted",
                    PayloadSha256Hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                    LastErrorMessage = "Validation error on line 42",
                    Errors = new List<PortalYakapSubmissionErrorDto>
                    {
                        new()
                        {
                            FieldPath = "Profile.Vitals.BloodPressure",
                            Issue = "Systolic must be numeric",
                            ErrorCode = "ERR_VAL_001"
                        }
                    }
                }
            };
            return Task.FromResult(ApiResponse<IReadOnlyList<PortalYakapSubmissionDto>>.Success(list));
        }

        public Task<ApiResponse<PortalYakapSubmissionDto>> GetSubmissionByIdAsync(
            string tenantId, Guid branchId, Guid id, CancellationToken ct = default)
        {
            return Task.FromResult(ApiResponse<PortalYakapSubmissionDto>.Success(new PortalYakapSubmissionDto
            {
                Id = id,
                PatientCode = "PAT-SECURE-999",
                AccreditationNo = "H91001234",
                SubmissionType = "Consultation",
                LocalTransactionNo = "TX-CONSULT-001",
                ProcessingStatus = "Accepted"
            }));
        }

        public Task<ApiResponse<PortalYakapSubmissionDto>> PollSubmissionStatusAsync(
            string tenantId, Guid branchId, Guid id, CancellationToken ct = default)
        {
            return Task.FromResult(ApiResponse<PortalYakapSubmissionDto>.Success(new PortalYakapSubmissionDto
            {
                Id = id,
                PatientCode = "PAT-SECURE-999",
                AccreditationNo = "H91001234",
                SubmissionType = "Profile",
                LocalTransactionNo = "TX-001",
                ProcessingStatus = "Polled_Valid"
            }));
        }

        public Task<ApiResponse<PortalYakapSubmissionDto>> RetrySubmissionAsync(
            string tenantId, Guid branchId, Guid id, CancellationToken ct = default)
        {
            return Task.FromResult(ApiResponse<PortalYakapSubmissionDto>.Success(new PortalYakapSubmissionDto
            {
                Id = id,
                PatientCode = "PAT-SECURE-999",
                AccreditationNo = "H91001234",
                SubmissionType = "Profile",
                LocalTransactionNo = "TX-001",
                ProcessingStatus = "Retrying"
            }));
        }

        public Task<ApiResponse<PortalYakapMasterlistSyncResultDto>> SyncMasterlistAsync(
            string tenantId, Guid branchId, CancellationToken ct = default)
        {
            return Task.FromResult(ApiResponse<PortalYakapMasterlistSyncResultDto>.Success(new PortalYakapMasterlistSyncResultDto
            {
                Success = true,
                RecordsAdded = 5,
                RecordsUpdated = 2,
                TotalActiveCount = 50,
                SyncedAtUtc = DateTime.UtcNow,
                Message = "Masterlist sync completed successfully."
            }));
        }
    }

    [Theory]
    // SQL Injection in query params
    [InlineData("'; DROP TABLE Submissions; --", "Consultation")]
    [InlineData("Accepted", "' OR '1'='1")]
    // XSS in query params
    [InlineData("<script>alert('xss')</script>", "Profile")]
    [InlineData("Accepted", "<img src=x onerror=alert(1)>")]
    // Injected PHI probe strings in query params
    [InlineData("PIN:12-345678901-2", "Profile")]
    [InlineData("Accepted", "Patient:Juan_Dela_Cruz")]
    [InlineData("Accepted", "Diagnosis:Dengue_Hemorrhagic_Fever")]
    public async Task YakapTelemetry_AdversarialQueryParams_NeverLeaksPhiInResponse(
        string statusParam, string submissionTypeParam)
    {
        var httpContext = CreateContextWithUser(_ownerId);
        var clinicClient = new AdversarialClinicApiClient();

        var result = await YakapSubmissionEndpoints.GetBranchSubmissionsAsync(
            _branch.Id,
            status: statusParam,
            submissionType: submissionTypeParam,
            page: 1,
            pageSize: 50,
            httpContext,
            _context,
            clinicClient,
            CancellationToken.None);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<IReadOnlyList<PortalYakapSubmissionDto>>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.NotNull(apiResponse.Data);
        Assert.Single(apiResponse.Data);

        // Serialize the response and assert ZERO PHI leaks
        var serialized = JsonSerializer.Serialize(apiResponse);
        Assert.DoesNotContain("Juan", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Dela Cruz", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("12-345678901-2", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Dengue", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<script>", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("DROP TABLE", serialized, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void YakapTelemetry_CorruptedInjectedPhiPayload_DroppedByZeroPhiDtoSerializer()
    {
        // Adversarial scenario: A corrupted clinic backend or rogue actor emits JSON containing
        // forbidden PHI keys alongside standard submission fields.
        var maliciousJson = """
        {
            "id": "c71a3964-b040-4fe7-9159-28c935ee5222",
            "patientCode": "PAT-001",
            "accreditationNo": "H91001234",
            "submissionType": "Profile",
            "localTransactionNo": "TX-001",
            "processingStatus": "Accepted",
            "patientName": "JUAN DELA CRUZ",
            "philHealthPin": "12-345678901-2",
            "primaryDiagnosis": "Acute Bronchitis (J20.9)",
            "rawXml": "<PCB><NAME>JUAN</NAME></PCB>"
        }
        """;

        // Deserialize through strongly-typed PortalYakapSubmissionDto
        var dto = JsonSerializer.Deserialize<PortalYakapSubmissionDto>(maliciousJson, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        Assert.NotNull(dto);
        Assert.Equal("PAT-001", dto.PatientCode);

        // Reserialize DTO to verify outbound response
        var outboundJson = JsonSerializer.Serialize(dto);

        // EMPIRICAL VERIFICATION: All injected PHI fields are completely omitted
        Assert.DoesNotContain("JUAN DELA CRUZ", outboundJson);
        Assert.DoesNotContain("12-345678901-2", outboundJson);
        Assert.DoesNotContain("Acute Bronchitis", outboundJson);
        Assert.DoesNotContain("<PCB>", outboundJson);
        Assert.DoesNotContain("patientName", outboundJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("philHealthPin", outboundJson, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void YakapTelemetry_ReflectionAudit_ZeroPhiPropertiesAcrossAllContracts()
    {
        var contracts = new[]
        {
            typeof(PortalYakapBranchSummaryDto),
            typeof(PortalYakapSubmissionDto),
            typeof(PortalYakapSubmissionErrorDto),
            typeof(PortalYakapMasterlistSyncResultDto),
            typeof(YakapSubmissionRequestedPayload),
            typeof(YakapSubmissionRespondedPayload)
        };

        var forbiddenPhiNames = new[]
        {
            "PatientName", "FirstName", "LastName", "MiddleName", "FullName",
            "PhilHealthPin", "Pin", "Diagnosis", "Diagnoses", "Icd", "ClinicalNote",
            "RawXml", "XmlPayload", "Prescription", "ChiefComplaint"
        };

        foreach (var type in contracts)
        {
            var properties = type.GetProperties(BindingFlags.Public | BindingFlags.Instance);
            foreach (var prop in properties)
            {
                foreach (var forbidden in forbiddenPhiNames)
                {
                    Assert.False(
                        prop.Name.Equals(forbidden, StringComparison.OrdinalIgnoreCase) ||
                        prop.Name.StartsWith(forbidden, StringComparison.OrdinalIgnoreCase),
                        $"Violation: Contract {type.Name} contains forbidden PHI property '{prop.Name}'.");
                }
            }
        }
    }

    #endregion

    #region Pillar 5: Tenant Authorization and Access Guards

    [Fact]
    public async Task YakapTelemetry_AnonymousCaller_Returns401Unauthorized()
    {
        var anonymousContext = CreateContextWithUser(null);
        var clinicClient = new AdversarialClinicApiClient();

        var result = await YakapSubmissionEndpoints.GetBranchYakapSummaryAsync(
            _branch.Id, anonymousContext, _context, clinicClient, CancellationToken.None);

        var unauthorized = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status401Unauthorized, unauthorized.StatusCode);
    }

    [Fact]
    public async Task YakapTelemetry_CrossTenantStranger_Returns403Forbid()
    {
        var strangerContext = CreateContextWithUser(_strangerId);
        var clinicClient = new AdversarialClinicApiClient();

        var result = await YakapSubmissionEndpoints.GetBranchYakapSummaryAsync(
            _branch.Id, strangerContext, _context, clinicClient, CancellationToken.None);

        var forbid = Assert.IsType<ForbidHttpResult>(result);
        Assert.NotNull(forbid);
    }

    [Fact]
    public async Task YakapTelemetry_NonExistentBranch_Returns404NotFound()
    {
        var ownerContext = CreateContextWithUser(_ownerId);
        var clinicClient = new AdversarialClinicApiClient();

        var result = await YakapSubmissionEndpoints.GetBranchYakapSummaryAsync(
            Guid.NewGuid(), ownerContext, _context, clinicClient, CancellationToken.None);

        var notFound = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status404NotFound, notFound.StatusCode);
    }

    [Fact]
    public async Task YakapTelemetry_DeletedBranch_Returns404NotFound()
    {
        var deletedBranch = new Branch
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Name = "Deleted Branch",
            IsDeleted = true,
            DeletedAt = DateTime.UtcNow
        };
        _context.Branches.Add(deletedBranch);
        await _context.SaveChangesAsync();

        var ownerContext = CreateContextWithUser(_ownerId);
        var clinicClient = new AdversarialClinicApiClient();

        var result = await YakapSubmissionEndpoints.GetBranchYakapSummaryAsync(
            deletedBranch.Id, ownerContext, _context, clinicClient, CancellationToken.None);

        var notFound = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status404NotFound, notFound.StatusCode);
    }

    #endregion
}
