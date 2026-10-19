using System;
using System.Collections.Generic;

namespace ClinicEz.Portal.Application.Features.Newsletter.DTOs;

public record NewsletterSubscriberDto(
    Guid Id,
    string Email,
    string Source,
    string Status,
    DateTime SubscribedAt
);

public record NewsletterSubscribersListResponse(
    List<NewsletterSubscriberDto> Subscribers,
    int TotalCount
);
