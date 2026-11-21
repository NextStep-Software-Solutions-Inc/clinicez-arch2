using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Comms.Infrastructure.Security;

public static class JpegExifStripper
{
    private static readonly byte[] JpegHeader = [0xFF, 0xD8];

    public static async Task<(bool Stripped, byte[] SanitizedBytes)> StripExifAsync(
        Stream inputStream,
        CancellationToken ct = default)
    {
        if (inputStream.CanSeek)
        {
            inputStream.Seek(0, SeekOrigin.Begin);
        }

        using var outputStream = new MemoryStream();
        var buffer = new byte[2];

        // Check SOI
        if (await inputStream.ReadAsync(buffer.AsMemory(0, 2), ct) != 2 ||
            buffer[0] != 0xFF || buffer[1] != 0xD8)
        {
            throw new InvalidDataException("Invalid JPEG stream: missing SOI header.");
        }
        await outputStream.WriteAsync(JpegHeader.AsMemory(0, 2), ct);

        var strippedAny = false;

        while (inputStream.Position < inputStream.Length)
        {
            var b = inputStream.ReadByte();
            if (b == -1) break;
            if (b != 0xFF) continue;

            // Handle multiple fill bytes 0xFF
            var marker = inputStream.ReadByte();
            while (marker == 0xFF)
            {
                marker = inputStream.ReadByte();
            }

            if (marker == -1) break;

            // Standalone markers without payload
            if (marker == 0xD8) continue; // SOI
            if (marker == 0xD9)           // EOI
            {
                outputStream.WriteByte(0xFF);
                outputStream.WriteByte((byte)marker);
                break;
            }

            // Start of Scan (SOS): everything from here to EOI is entropy-coded image data
            if (marker == 0xDA)
            {
                outputStream.WriteByte(0xFF);
                outputStream.WriteByte(0xDA);
                await inputStream.CopyToAsync(outputStream, ct);
                break;
            }

            // RST markers (0xD0 - 0xD7) have no length bytes
            if (marker >= 0xD0 && marker <= 0xD7)
            {
                outputStream.WriteByte(0xFF);
                outputStream.WriteByte((byte)marker);
                continue;
            }

            // Read 2-byte segment length (big-endian)
            var lenHi = inputStream.ReadByte();
            var lenLo = inputStream.ReadByte();
            if (lenHi == -1 || lenLo == -1) break;
            var segmentLength = (lenHi << 8) | lenLo;
            var payloadLength = segmentLength - 2;

            if (payloadLength < 0)
            {
                throw new InvalidDataException("Malformed JPEG segment length.");
            }

            // Strip APP1 (0xE1: EXIF/XMP), APP13 (0xED: IPTC), COM (0xFE: Comments)
            if (marker == 0xE1 || marker == 0xED || marker == 0xFE)
            {
                if (inputStream.CanSeek)
                {
                    inputStream.Seek(payloadLength, SeekOrigin.Current);
                }
                else
                {
                    var dummy = new byte[payloadLength];
                    _ = await inputStream.ReadAsync(dummy.AsMemory(0, payloadLength), ct);
                }
                strippedAny = true;
                continue;
            }

            // Keep all other segments (APP0, DQT, DHT, SOF, ICC_PROFILE)
            outputStream.WriteByte(0xFF);
            outputStream.WriteByte((byte)marker);
            outputStream.WriteByte((byte)lenHi);
            outputStream.WriteByte((byte)lenLo);

            var segmentPayload = new byte[payloadLength];
            var read = await inputStream.ReadAsync(segmentPayload.AsMemory(0, payloadLength), ct);
            if (read != payloadLength)
            {
                throw new InvalidDataException("Unexpected end of JPEG segment payload.");
            }
            await outputStream.WriteAsync(segmentPayload.AsMemory(0, payloadLength), ct);
        }

        return (strippedAny, outputStream.ToArray());
    }
}
