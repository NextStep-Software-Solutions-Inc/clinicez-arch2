using System;
using QRCoder;

namespace ClinicEz.Shared.Documents.Security;

public interface IQrCodeService
{
    byte[] GenerateQrCodePng(string payload, int pixelsPerModule = 4);
}

public class QrCodeService : IQrCodeService
{
    public byte[] GenerateQrCodePng(string payload, int pixelsPerModule = 4)
    {
        if (string.IsNullOrWhiteSpace(payload))
            payload = "CLINICEZ";

        using var qrGenerator = new QRCodeGenerator();
        using var qrCodeData = qrGenerator.CreateQrCode(payload, QRCodeGenerator.ECCLevel.M);
        var qrCode = new PngByteQRCode(qrCodeData);
        return qrCode.GetGraphic(pixelsPerModule);
    }
}
