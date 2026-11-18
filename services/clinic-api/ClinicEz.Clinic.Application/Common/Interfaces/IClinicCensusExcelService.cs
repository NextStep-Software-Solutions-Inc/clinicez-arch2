using ClinicEz.Clinic.Application.Features.Reports.DTOs;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

public interface IClinicCensusExcelService
{
    byte[] GenerateClinicCensusExcel(ClinicCensusReportDto report, FacilitySettings settings);
}
