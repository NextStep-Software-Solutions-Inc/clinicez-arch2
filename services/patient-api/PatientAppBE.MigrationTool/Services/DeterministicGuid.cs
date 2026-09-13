using System.Security.Cryptography;
using System.Text;

namespace PatientAppBE.MigrationTool.Services;

public static class DeterministicGuid
{
    private static readonly byte[] NamespaceBytes = new Guid("f0966d4d-20b8-4f2f-9f9a-3ac80a0d4f16").ToByteArray();

    public static Guid Create(string name)
    {
        var nameBytes = Encoding.UTF8.GetBytes(name);
        var hashInput = new byte[NamespaceBytes.Length + nameBytes.Length];
        Buffer.BlockCopy(NamespaceBytes, 0, hashInput, 0, NamespaceBytes.Length);
        Buffer.BlockCopy(nameBytes, 0, hashInput, NamespaceBytes.Length, nameBytes.Length);

        var hash = SHA256.HashData(hashInput);
        var guidBytes = hash[..16];

        guidBytes[7] = (byte)((guidBytes[7] & 0x0F) | 0x50);
        guidBytes[8] = (byte)((guidBytes[8] & 0x3F) | 0x80);

        return new Guid(guidBytes);
    }
}

