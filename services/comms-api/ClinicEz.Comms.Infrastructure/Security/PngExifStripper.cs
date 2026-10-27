using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Comms.Infrastructure.Security;

public static class PngExifStripper
{
    private static readonly byte[] PngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    private static readonly HashSet<string> StrippedChunks = new(StringComparer.Ordinal)
    {
        "eXIf", "tEXt", "zTXt", "iTXt", "dSIG"
    };

    public static async Task<(bool Stripped, byte[] SanitizedBytes)> StripMetadataAsync(
        Stream inputStream,
        CancellationToken ct = default)
    {
        if (inputStream.CanSeek)
        {
            inputStream.Seek(0, SeekOrigin.Begin);
        }

        using var outputStream = new MemoryStream();
        var sigBuffer = new byte[8];
        if (await inputStream.ReadAsync(sigBuffer.AsMemory(0, 8), ct) != 8 ||
            !sigBuffer.AsSpan().SequenceEqual(PngSignature))
        {
            throw new InvalidDataException("Invalid PNG signature.");
        }
        await outputStream.WriteAsync(PngSignature.AsMemory(0, 8), ct);

        var strippedAny = false;
        var headerBuffer = new byte[8]; // 4 bytes length, 4 bytes type

        while (inputStream.Position < inputStream.Length)
        {
            var read = await inputStream.ReadAsync(headerBuffer.AsMemory(0, 8), ct);
            if (read == 0) break;
            if (read < 8) throw new InvalidDataException("Truncated PNG chunk header.");

            var chunkLength = BinaryPrimitives.ReadUInt32BigEndian(headerBuffer.AsSpan(0, 4));
            var chunkType = Encoding.ASCII.GetString(headerBuffer, 4, 4);

            if (StrippedChunks.Contains(chunkType))
            {
                if (inputStream.CanSeek)
                {
                    inputStream.Seek(chunkLength + 4, SeekOrigin.Current);
                }
                else
                {
                    var dummy = new byte[chunkLength + 4];
                    _ = await inputStream.ReadAsync(dummy.AsMemory(0, (int)(chunkLength + 4)), ct);
                }
                strippedAny = true;
                continue;
            }

            // Write chunk length and type
            await outputStream.WriteAsync(headerBuffer.AsMemory(0, 8), ct);

            // Copy data + 4 bytes CRC
            var totalToCopy = chunkLength + 4;
            var chunkData = new byte[totalToCopy];
            var dataRead = await inputStream.ReadAsync(chunkData.AsMemory(0, (int)totalToCopy), ct);
            if (dataRead != totalToCopy)
            {
                throw new InvalidDataException($"Truncated PNG chunk data for {chunkType}.");
            }
            await outputStream.WriteAsync(chunkData.AsMemory(0, (int)totalToCopy), ct);

            if (chunkType == "IEND") break;
        }

        return (strippedAny, outputStream.ToArray());
    }
}
