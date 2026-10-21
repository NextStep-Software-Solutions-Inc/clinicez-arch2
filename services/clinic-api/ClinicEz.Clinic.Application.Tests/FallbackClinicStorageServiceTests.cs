using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Infrastructure.Services.Storage;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class FallbackClinicStorageServiceTests
{
    private readonly IClinicStorageService _mockPrimary;
    private readonly IClinicStorageService _mockFallback;
    private readonly FallbackClinicStorageService _service;

    public FallbackClinicStorageServiceTests()
    {
        _mockPrimary = Substitute.For<IClinicStorageService>();
        _mockFallback = Substitute.For<IClinicStorageService>();
        _service = new FallbackClinicStorageService(_mockPrimary, _mockFallback, NullLogger<FallbackClinicStorageService>.Instance);
    }

    [Fact]
    public async Task SaveEncryptedFileAsync_AlwaysCallsPrimaryOnly()
    {
        // Arrange
        var key = "tenants/t1/clinics/c1/records/file.cez";
        var bytes = new byte[] { 1, 2, 3 };
        _mockPrimary.SaveEncryptedFileAsync(key, bytes, Arg.Any<CancellationToken>())
            .Returns(key);

        // Act
        var result = await _service.SaveEncryptedFileAsync(key, bytes);

        // Assert
        result.Should().Be(key);
        await _mockPrimary.Received(1).SaveEncryptedFileAsync(key, bytes, Arg.Any<CancellationToken>());
        await _mockFallback.DidNotReceive().SaveEncryptedFileAsync(Arg.Any<string>(), Arg.Any<byte[]>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ReadEncryptedFileAsync_WhenPrimarySucceeds_DoesNotInvokeFallback()
    {
        // Arrange
        var key = "tenants/t1/clinics/c1/records/file.cez";
        var bytes = new byte[] { 10, 20, 30 };
        _mockPrimary.ReadEncryptedFileAsync(key, Arg.Any<CancellationToken>())
            .Returns(bytes);

        // Act
        var result = await _service.ReadEncryptedFileAsync(key);

        // Assert
        result.Should().Equal(bytes);
        await _mockPrimary.Received(1).ReadEncryptedFileAsync(key, Arg.Any<CancellationToken>());
        await _mockFallback.DidNotReceive().ReadEncryptedFileAsync(Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ReadEncryptedFileAsync_WhenPrimaryThrowsFileNotFound_FallsBackToSecondary()
    {
        // Arrange
        var key = "tenants/t1/clinics/c1/records/file.cez";
        var fallbackBytes = new byte[] { 99, 88, 77 };
        _mockPrimary.ReadEncryptedFileAsync(key, Arg.Any<CancellationToken>())
            .Returns<byte[]>(_ => throw new FileNotFoundException("Not in R2"));
        _mockFallback.ReadEncryptedFileAsync(key, Arg.Any<CancellationToken>())
            .Returns(fallbackBytes);

        // Act
        var result = await _service.ReadEncryptedFileAsync(key);

        // Assert
        result.Should().Equal(fallbackBytes);
        await _mockPrimary.Received(1).ReadEncryptedFileAsync(key, Arg.Any<CancellationToken>());
        await _mockFallback.Received(1).ReadEncryptedFileAsync(key, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ReadEncryptedFileAsync_WhenBothFail_ThrowsFileNotFoundException()
    {
        // Arrange
        var key = "tenants/t1/clinics/c1/records/file.cez";
        _mockPrimary.ReadEncryptedFileAsync(key, Arg.Any<CancellationToken>())
            .Returns<byte[]>(_ => throw new FileNotFoundException("Not in R2"));
        _mockFallback.ReadEncryptedFileAsync(key, Arg.Any<CancellationToken>())
            .Returns<byte[]>(_ => throw new FileNotFoundException("Not on local disk"));

        // Act & Assert
        var act = () => _service.ReadEncryptedFileAsync(key);
        await act.Should().ThrowAsync<FileNotFoundException>();
    }

    [Fact]
    public async Task FileExistsAsync_ReturnsTrueIfEitherHasFile()
    {
        // Primary has it
        _mockPrimary.FileExistsAsync("key1", Arg.Any<CancellationToken>()).Returns(true);
        (await _service.FileExistsAsync("key1")).Should().BeTrue();

        // Primary missing, fallback has it
        _mockPrimary.FileExistsAsync("key2", Arg.Any<CancellationToken>()).Returns(false);
        _mockFallback.FileExistsAsync("key2", Arg.Any<CancellationToken>()).Returns(true);
        (await _service.FileExistsAsync("key2")).Should().BeTrue();

        // Neither has it
        _mockPrimary.FileExistsAsync("key3", Arg.Any<CancellationToken>()).Returns(false);
        _mockFallback.FileExistsAsync("key3", Arg.Any<CancellationToken>()).Returns(false);
        (await _service.FileExistsAsync("key3")).Should().BeFalse();
    }
}
