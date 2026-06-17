using CLINICEZ.Shared.Exceptions;
using MediatR;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Enums;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Application.Features.Patients.Commands.CreatePatient;

public sealed class CreatePatientCommandHandler : IRequestHandler<CreatePatientCommand, Guid>
{
    private readonly IPatientRepository _patientRepository;
    private readonly IUnitOfWork _unitOfWork;

    public CreatePatientCommandHandler(IPatientRepository patientRepository, IUnitOfWork unitOfWork)
    {
        _patientRepository = patientRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<Guid> Handle(CreatePatientCommand request, CancellationToken cancellationToken)
    {
        var existing = await _patientRepository.GetByClerkUserIdAsync(request.ClerkUserId, cancellationToken);
        if (existing is not null)
            throw new ConflictException($"A patient profile for this Clerk user already exists.");

        var patient = new Patient
        {
            ClientId = Guid.NewGuid(),
            ClerkUserId = request.ClerkUserId,
            FirstName = request.FirstName,
            MiddleName = request.MiddleName,
            LastName = request.LastName,
            Suffix = request.Suffix,
            Sex = Enum.TryParse<SexType>(request.Sex, true, out var sex) ? sex : null,
            DateOfBirth = request.DateOfBirth,
            Nationality = request.Nationality ?? "Filipino",
        };

        await _patientRepository.AddAsync(patient, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return patient.Id;
    }
}
