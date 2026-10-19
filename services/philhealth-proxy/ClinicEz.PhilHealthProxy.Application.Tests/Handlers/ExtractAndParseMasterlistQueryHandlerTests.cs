using ClinicEz.PhilHealthProxy.Application.Features.Yakap.Queries.ExtractAndParseMasterlist;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using FluentAssertions;
using Microsoft.AspNetCore.DataProtection;
using NSubstitute;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Application.Tests.Handlers;

public sealed class ExtractAndParseMasterlistQueryHandlerTests
{
    private readonly ICurrentTenant _currentTenant = Substitute.For<ICurrentTenant>();
    private readonly ITenantRepository _tenantRepository = Substitute.For<ITenantRepository>();
    private readonly IDataProtectionProvider _dataProtectionProvider = Substitute.For<IDataProtectionProvider>();
    private readonly IDataProtector _protector = Substitute.For<IDataProtector>();
    private readonly IPhilHealthSoapClient _soapClient = Substitute.For<IPhilHealthSoapClient>();
    private readonly IPhilHealthPayloadEncryptor _encryptor = Substitute.For<IPhilHealthPayloadEncryptor>();
    private readonly IKonsultaMasterlistParser _parser = Substitute.For<IKonsultaMasterlistParser>();

    public ExtractAndParseMasterlistQueryHandlerTests()
    {
        _dataProtectionProvider.CreateProtector(Arg.Any<string>()).Returns(_protector);
        _protector.Unprotect(Arg.Any<byte[]>()).Returns(System.Text.Encoding.UTF8.GetBytes("TEST-CIPHER-KEY"));
    }

    [Fact]
    public async Task Handle_ShouldDecryptPayloadAndParseAssignments_WhenSuccessful()
    {
        // Arrange
        var tenantId = Guid.NewGuid();
        _currentTenant.TenantId.Returns(tenantId);
        _tenantRepository.GetByTenantIdAsync(tenantId, Arg.Any<CancellationToken>())
            .Returns(new PhilHealthTenant
            {
                TenantId = tenantId,
                EncryptedCipherKey = "MTIzNDU2NzgxMjM0NTY3OA"
            });

        const string jsonEnvelope = "{\"docMimeType\":\"<text/xml>\",\"doc\":\"ciphertext\"}";
        const string soapResponse = $"<return>{jsonEnvelope}</return>";
        const string decryptedXml = "<ASSIGNMENTS pHciAccreNo=\"H90000001\"><ASSIGNMENT pAssignedPin=\"030263078507\" /></ASSIGNMENTS>";

        _soapClient.ExtractRegistrationListAsync("2026-01-01", "2026-10-01", Arg.Any<CancellationToken>())
            .Returns(new SoapResult(true, soapResponse, null, null));

        _encryptor.DecryptPayload(jsonEnvelope, Arg.Any<string>()).Returns(decryptedXml);

        var expectedResult = new YakapMasterlistResult(
            HciAccreNo: "H90000001",
            TotalCount: 1,
            TransmittalNumber: "RH9000000120261000001",
            Assignments: new[]
            {
                new YakapAssignmentDto(
                    AssignedPin: "030263078507",
                    AssignedLastName: "DELA CRUZ",
                    AssignedFirstName: "JUAN",
                    AssignedMiddleName: "SANTOS",
                    AssignedExtName: "",
                    AssignedDateOfBirth: "1985-05-15",
                    AssignedSex: "M",
                    AssignedType: "MM",
                    PrimaryPin: "030263078507",
                    PrimaryLastName: "DELA CRUZ",
                    PrimaryFirstName: "JUAN",
                    PrimaryMiddleName: "SANTOS",
                    PrimaryExtName: "",
                    PrimaryDateOfBirth: "1985-05-15",
                    PrimarySex: "M",
                    MobileNumber: "09171234567",
                    LandlineNumber: "",
                    MemberCategory: "DIRECT",
                    MemberCategoryDescription: "Direct Contributor",
                    PackageType: "K",
                    AssignedDate: "2026-01-10",
                    AssignedStatus: "1",
                    EffectiveYear: "2026")
            });

        _parser.ParseMasterlistXml(decryptedXml).Returns(expectedResult);

        var handler = new ExtractAndParseMasterlistQueryHandler(
            _currentTenant,
            _tenantRepository,
            _dataProtectionProvider,
            _soapClient,
            _encryptor,
            _parser);

        // Act
        var result = await handler.Handle(
            new ExtractAndParseMasterlistQuery { StartDate = "2026-01-01", EndDate = "2026-10-01" },
            CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
        result.Data!.HciAccreNo.Should().Be("H90000001");
        result.Data.Assignments.Should().HaveCount(1);
        result.Data.Assignments[0].AssignedPin.Should().Be("030263078507");
    }
}
