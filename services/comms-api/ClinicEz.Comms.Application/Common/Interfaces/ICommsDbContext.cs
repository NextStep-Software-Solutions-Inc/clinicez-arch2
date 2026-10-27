using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Shared.Interop.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Comms.Application.Common.Interfaces;

public interface ICommsDbContext
{
    DbSet<Conversation> Conversations { get; }
    DbSet<Participant> Participants { get; }
    DbSet<Message> Messages { get; }
    DbSet<MessageReaction> MessageReactions { get; }
    DbSet<MessageAttachment> MessageAttachments { get; }
    DbSet<EligibilityGrant> EligibilityGrants { get; }
    DbSet<InteropOutboxMessage> InteropOutbox { get; }
    DbSet<InteropInboxMessage> InteropInbox { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
