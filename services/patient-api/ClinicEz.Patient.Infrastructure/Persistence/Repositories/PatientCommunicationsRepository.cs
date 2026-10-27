using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Infrastructure.Persistence.Repositories;

public sealed class PatientCommunicationsRepository : BaseRepository<PatientConversation>, IPatientCommunicationsRepository
{
    public PatientCommunicationsRepository(ApplicationDbContext context) : base(context) { }

    public async Task<IReadOnlyList<PatientConversation>> GetConversationsForPatientsAsync(
        IEnumerable<Guid> patientIds,
        bool includeHidden = false,
        CancellationToken ct = default)
    {
        var idList = patientIds.ToList();
        var query = Context.PatientConversations
            .AsNoTracking()
            .Where(c => idList.Contains(c.PatientId));

        if (!includeHidden)
        {
            query = query.Where(c => !c.IsHiddenByPatient);
        }

        return await query
            .OrderByDescending(c => c.LastMessageAtUtc)
            .ToListAsync(ct);
    }

    public async Task<PatientConversation?> GetConversationByIdAsync(Guid conversationId, CancellationToken ct = default)
    {
        return await Context.PatientConversations
            .FirstOrDefaultAsync(c => c.Id == conversationId, ct);
    }

    public async Task<PatientConversation?> GetConversationWithMessagesAsync(Guid conversationId, CancellationToken ct = default)
    {
        return await Context.PatientConversations
            .Include(c => c.Messages.OrderBy(m => m.Seq))
                .ThenInclude(m => m.Attachments)
            .FirstOrDefaultAsync(c => c.Id == conversationId, ct);
    }

    public async Task<PatientMessage?> GetMessageByIdAsync(Guid messageId, CancellationToken ct = default)
    {
        return await Context.PatientMessages
            .Include(m => m.Conversation)
            .Include(m => m.Attachments)
            .FirstOrDefaultAsync(m => m.Id == messageId, ct);
    }

    public async Task<PatientEligibilityGrant?> GetActiveGrantAsync(
        Guid patientId,
        string facilityId,
        DateTime now,
        CancellationToken ct = default)
    {
        return await Context.PatientEligibilityGrants
            .AsNoTracking()
            .FirstOrDefaultAsync(g =>
                g.PatientId == patientId &&
                g.FacilityId == facilityId &&
                g.IsActive &&
                (g.WindowEndUtc == null || g.WindowEndUtc > now),
                ct);
    }

    public async Task<IReadOnlyList<PatientEligibilityGrant>> GetActiveGrantsForPatientsAsync(
        IEnumerable<Guid> patientIds,
        DateTime now,
        CancellationToken ct = default)
    {
        var idList = patientIds.ToList();
        return await Context.PatientEligibilityGrants
            .AsNoTracking()
            .Where(g =>
                idList.Contains(g.PatientId) &&
                g.IsActive &&
                (g.WindowEndUtc == null || g.WindowEndUtc > now))
            .OrderByDescending(g => g.SyncedAtUtc)
            .ToListAsync(ct);
    }

    public async Task AddConversationAsync(PatientConversation conversation, CancellationToken ct = default)
    {
        await Context.PatientConversations.AddAsync(conversation, ct);
    }

    public async Task AddMessageAsync(PatientMessage message, CancellationToken ct = default)
    {
        await Context.PatientMessages.AddAsync(message, ct);
    }

    public async Task AddAttachmentAsync(PatientMessageAttachment attachment, CancellationToken ct = default)
    {
        await Context.PatientMessageAttachments.AddAsync(attachment, ct);
    }

    public async Task<long> GetNextSequenceForConversationAsync(Guid conversationId, CancellationToken ct = default)
    {
        var maxSeq = await Context.PatientMessages
            .Where(m => m.ConversationId == conversationId)
            .MaxAsync(m => (long?)m.Seq, ct);

        return (maxSeq ?? 0) + 1;
    }

    public void UpdateConversation(PatientConversation conversation)
    {
        Context.PatientConversations.Update(conversation);
    }

    public void UpdateMessage(PatientMessage message)
    {
        Context.PatientMessages.Update(message);
    }
}
