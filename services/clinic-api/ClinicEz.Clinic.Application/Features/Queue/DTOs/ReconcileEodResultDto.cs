using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Queue.DTOs;

public sealed record ReconcileEodResultDto(
    int ReconciledCount,
    DateOnly ReconciliationDate,
    DateTime ReconciledAt,
    IReadOnlyList<string> AffectedTicketNumbers,
    string Summary);
