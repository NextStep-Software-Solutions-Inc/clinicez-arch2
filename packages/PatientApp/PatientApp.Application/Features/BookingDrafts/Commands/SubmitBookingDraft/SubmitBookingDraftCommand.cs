using CLINICEZ.Shared.Exceptions;
using CLINICEZ.Shared.Interfaces;
using MediatR;
using PatientApp.Application.Common.Interfaces;
using PatientApp.Domain.Enums;
using PatientApp.Domain.Interfaces;
using PatientApp.Domain.Entities;

namespace PatientApp.Application.Features.BookingDrafts.Commands.SubmitBookingDraft;

public sealed record SubmitBookingDraftCommand(Guid PatientId, Guid DraftId) : IRequest<string?>;

public sealed class SubmitBookingDraftCommandHandler : IRequestHandler<SubmitBookingDraftCommand, string?>
{
    private readonly IBookingDraftRepository _draftRepo;
    private readonly IClinicRepository _clinicRepo;
    private readonly IClinicDashboardService _clinicService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _uow;

    private readonly IClinicMembershipRepository _membershipRepo;

    public SubmitBookingDraftCommandHandler(
        IBookingDraftRepository draftRepo, IClinicRepository clinicRepo,
        IClinicDashboardService clinicService, ICurrentUserService currentUserService, IUnitOfWork uow,
        IClinicMembershipRepository membershipRepo)
    {
        _draftRepo = draftRepo; _clinicRepo = clinicRepo;
        _clinicService = clinicService; _currentUserService = currentUserService; _uow = uow;
        _membershipRepo = membershipRepo;
    }

    public async Task<string?> Handle(SubmitBookingDraftCommand request, CancellationToken cancellationToken)
    {
        var draft = await _draftRepo.GetByIdAsync(request.DraftId, cancellationToken)
            ?? throw new NotFoundException($"Booking draft '{request.DraftId}' was not found.");

        if (draft.PatientId != request.PatientId)
            throw new ForbiddenException("This booking draft does not belong to the requesting patient.");

        if (draft.Status == BookingDraftStatus.Ready)
            throw new ConflictException("Booking has already been submitted.");

        var clinic = await _clinicRepo.GetByIdAsync(draft.ClinicId, cancellationToken)
            ?? throw new NotFoundException($"Clinic '{draft.ClinicId}' was not found.");

        var bearerToken = _currentUserService.UserId ?? string.Empty;
        var bookingRef = await _clinicService.SubmitBookingAsync(
            clinic.BaseUrl, request.PatientId, draft.Id,
            draft.ShareFieldsJson, bearerToken, cancellationToken);

        var membership = await _membershipRepo.GetByPatientAndClinicAsync(request.PatientId, clinic.Id, cancellationToken);
        if (membership is null && clinic.IsPublic)
        {
            membership = new ClinicMembership
            {
                PatientId = request.PatientId,
                ClinicId = clinic.Id,
                Status = MembershipStatus.Pending,
                ConsentPrivacyPolicy = true,
                ConsentTermsAndConditions = true,
                ConsentDataSharing = true,
                ConsentedAt = DateTime.UtcNow
            };
            await _membershipRepo.AddAsync(membership, cancellationToken);
        }

        draft.Status = BookingDraftStatus.Ready;
        _draftRepo.Update(draft);
        await _uow.SaveChangesAsync(cancellationToken);

        return bookingRef;
    }
}
