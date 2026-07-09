using CLINICEZ.Shared.Exceptions;
using MediatR;
using PatientAppBE.Domain.Enums;
using PatientAppBE.Domain.Interfaces;

namespace PatientAppBE.Application.Features.Patients.Commands.UpdatePatientDemographics;

public sealed class UpdatePatientDemographicsCommandHandler : IRequestHandler<UpdatePatientDemographicsCommand>
{
    private readonly IPatientRepository _patientRepository;
    private readonly IUnitOfWork _unitOfWork;

    public UpdatePatientDemographicsCommandHandler(IPatientRepository patientRepository, IUnitOfWork unitOfWork)
    {
        _patientRepository = patientRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task Handle(UpdatePatientDemographicsCommand request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepository.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        patient.FirstName       = request.FirstName;
        patient.MiddleName      = request.MiddleName;
        patient.LastName        = request.LastName;
        patient.Suffix          = request.Suffix;
        patient.Sex             = Enum.TryParse<SexType>(request.Sex, true, out var sex) ? sex : null;
        patient.DateOfBirth     = request.DateOfBirth;
        patient.PlaceOfBirth    = request.PlaceOfBirth;
        patient.CivilStatus     = Enum.TryParse<CivilStatus>(request.CivilStatus, true, out var cs) ? cs : null;
        patient.BloodType       = Enum.TryParse<BloodType>(request.BloodType, true, out var bt) ? bt : null;
        patient.Nationality     = request.Nationality;
        patient.Ethnicity       = request.Ethnicity;
        patient.Religion        = request.Religion;
        patient.PrimaryLanguage = request.PrimaryLanguage;
        patient.EducationLevel  = Enum.TryParse<EducationLevel>(request.EducationLevel, true, out var el) ? el : null;
        patient.Mobile          = request.Mobile;
        patient.AltPhone        = request.AltPhone;
        patient.Email           = request.Email;
        patient.MessengerHandle = request.MessengerHandle;
        patient.ConsentToShareInfo = request.ConsentToShareInfo;

        _patientRepository.Update(patient);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }
}
