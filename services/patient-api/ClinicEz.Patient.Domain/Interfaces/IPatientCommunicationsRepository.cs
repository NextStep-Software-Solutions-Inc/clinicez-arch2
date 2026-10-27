using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Domain.Interfaces;

public interface IPatientCommunicationsRepository
{
    Task<IReadOnlyList<PatientConversation>> GetConversationsForPatientsAsync(
        IEnumerable<Guid> patientIds,
        bool includeHidden = false,
        CancellationToken ct = default);

    Task<PatientConversation?> GetConversationByIdAsync(Guid conversationId, CancellationToken ct = default);

    Task<PatientConversation?> GetConversationWithMessagesAsync(Guid conversationId, CancellationToken ct = default);

    Task<PatientMessage?> GetMessageByIdAsync(Guid messageId, CancellationToken ct = default);

    Task<PatientEligibilityGrant?> GetActiveGrantAsync(Guid patientId, string facilityId, DateTime now, CancellationToken ct = default);

    Task<IReadOnlyList<PatientEligibilityGrant>> GetActiveGrantsForPatientsAsync(
        IEnumerable<Guid> patientIds,
        DateTime now,
        CancellationToken ct = default);

    Task AddConversationAsync(PatientConversation conversation, CancellationToken ct = default);

    Task AddMessageAsync(PatientMessage message, CancellationToken ct = default);

    Task AddAttachmentAsync(PatientMessageAttachment attachment, CancellationToken ct = default);

    Task<long> GetNextSequenceForConversationAsync(Guid conversationId, CancellationToken ct = default);

    void UpdateConversation(PatientConversation conversation);

    void UpdateMessage(PatientMessage message);
}
