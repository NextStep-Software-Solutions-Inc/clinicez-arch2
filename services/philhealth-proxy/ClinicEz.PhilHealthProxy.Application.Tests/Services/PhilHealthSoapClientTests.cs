using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.PhilHealthProxy.Infrastructure.Services;
using FluentAssertions;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Application.Tests.Services;

public sealed class PhilHealthSoapClientTests
{
    private sealed class CapturingHttpMessageHandler : HttpMessageHandler
    {
        public HttpRequestMessage? LastRequest { get; private set; }
        public string? LastRequestBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            LastRequest = request;
            if (request.Content != null)
            {
                LastRequestBody = await request.Content.ReadAsStringAsync(cancellationToken);
            }

            var soapResponseXml = @"<soapenv:Envelope xmlns:soapenv=""http://schemas.xmlsoap.org/soap/envelope/"" xmlns:phi=""http://philhealth.gov.ph/"">
   <soapenv:Body>
      <phi:getTokenResponse>
         <return>TEST_TOKEN_XYZ_123</return>
      </phi:getTokenResponse>
   </soapenv:Body>
</soapenv:Envelope>";

            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(soapResponseXml, Encoding.UTF8, "text/xml")
            };
        }
    }

    [Fact]
    public async Task GetTokenAsync_WithEmptyOrUnencryptedCredentials_SafelyEmitsEmptyElementsWithoutCryptographicException()
    {
        var tenantId = Guid.NewGuid();
        var handler = new CapturingHttpMessageHandler();
        var httpClient = new HttpClient(handler);

        var currentTenant = Substitute.For<ICurrentTenant>();
        currentTenant.TenantId.Returns(tenantId);
        currentTenant.BranchId.Returns((Guid?)null);

        var tenantRepo = Substitute.For<ITenantRepository>();
        tenantRepo.GetByTenantIdAsync(tenantId, Arg.Any<CancellationToken>())
            .Returns(new PhilHealthTenant
            {
                TenantId = tenantId,
                AccreditationNumber = "P10038831",
                SoftwareCertificateId = "KON-DUMMYCERTS-Z15445",
                EncryptedUsername = "", // Empty unencrypted string
                EncryptedPassword = "invalid-payload-that-throws-cryptographic-exception",
                KonsultaEndpoint = "https://staging.philhealth.gov.ph/KONSULTA/SOAP",
                IsActive = true
            });

        var dataProtection = new EphemeralDataProtectionProvider();
        var tokenCache = Substitute.For<IPhilHealthTokenCache>();
        var sandboxService = Substitute.For<ISoapSandboxService>();

        var client = new PhilHealthSoapClient(
            httpClient,
            currentTenant,
            tenantRepo,
            dataProtection,
            tokenCache,
            sandboxService,
            NullLogger<PhilHealthSoapClient>.Instance);

        // Act
        var result = await client.GetTokenAsync(CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        handler.LastRequestBody.Should().NotBeNull();

        var xml = XDocument.Parse(handler.LastRequestBody!);
        XNamespace phiNs = "http://philhealth.gov.ph/";
        var usernameElem = xml.Descendants(phiNs + "pUsername").FirstOrDefault();
        var passwordElem = xml.Descendants(phiNs + "pUserPassword").FirstOrDefault();

        usernameElem.Should().NotBeNull();
        usernameElem!.Value.Should().BeEmpty(); // Emits <phi:pUsername></phi:pUsername>

        passwordElem.Should().NotBeNull();
        passwordElem!.Value.Should().BeEmpty(); // Emits <phi:pUserPassword></phi:pUserPassword>
    }

    [Fact]
    public async Task CheckUploadStatusAsync_WithBlankCredentials_HandlesSafelyWithoutException()
    {
        var tenantId = Guid.NewGuid();
        var handler = new CapturingHttpMessageHandler();
        var httpClient = new HttpClient(handler);

        var currentTenant = Substitute.For<ICurrentTenant>();
        currentTenant.TenantId.Returns(tenantId);
        currentTenant.BranchId.Returns((Guid?)null);

        var tenantRepo = Substitute.For<ITenantRepository>();
        tenantRepo.GetByTenantIdAsync(tenantId, Arg.Any<CancellationToken>())
            .Returns(new PhilHealthTenant
            {
                TenantId = tenantId,
                AccreditationNumber = "P10038831",
                SoftwareCertificateId = "KON-DUMMYCERTS-Z15445",
                EncryptedUsername = "",
                EncryptedPassword = "",
                KonsultaEndpoint = "https://staging.philhealth.gov.ph/KONSULTA/SOAP",
                IsActive = true
            });

        var dataProtection = new EphemeralDataProtectionProvider();
        var tokenCache = Substitute.For<IPhilHealthTokenCache>();
        var sandboxService = Substitute.For<ISoapSandboxService>();

        var client = new PhilHealthSoapClient(
            httpClient,
            currentTenant,
            tenantRepo,
            dataProtection,
            tokenCache,
            sandboxService,
            NullLogger<PhilHealthSoapClient>.Instance);

        var result = await client.CheckUploadStatusAsync("2026-10-01", "2026-10-24", "TRANS-1", "REPORT", CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        handler.LastRequestBody.Should().NotBeNull();

        var xml = XDocument.Parse(handler.LastRequestBody!);
        XNamespace phiNs = "http://philhealth.gov.ph/";
        var usernameElem = xml.Descendants(phiNs + "pUsername").FirstOrDefault();
        usernameElem.Should().NotBeNull();
        usernameElem!.Value.Should().BeEmpty();
    }
}
