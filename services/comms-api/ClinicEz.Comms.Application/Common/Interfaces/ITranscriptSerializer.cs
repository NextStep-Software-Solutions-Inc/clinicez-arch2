using System.Collections.Generic;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Comms.Application.Common.Interfaces;

public sealed record SerializedTranscript(
    PatientCommunicationTranscriptDocument Document,
    string Json,
    string Markdown,
    string Sha256);

public interface ITranscriptSerializer
{
    SerializedTranscript Serialize(
        Conversation conversation,
        IReadOnlyList<Participant> participants,
        IReadOnlyList<Message> messages);
}
