using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Application.Features.Requisitions.Queries;

public record GetPrintableStickersQuery(Guid? RequisitionId = null, string? AccessionNumber = null) : IRequest<List<PrintableTubeStickerDto>>;

public class GetPrintableStickersQueryHandler : IRequestHandler<GetPrintableStickersQuery, List<PrintableTubeStickerDto>>
{
    private readonly IRepository<LabRequisition> _requisitionRepository;

    public GetPrintableStickersQueryHandler(IRepository<LabRequisition> requisitionRepository)
    {
        _requisitionRepository = requisitionRepository;
    }

    public async Task<List<PrintableTubeStickerDto>> Handle(GetPrintableStickersQuery request, CancellationToken cancellationToken)
    {
        var query = _requisitionRepository.Query().Include(r => r.Specimens).AsNoTracking();

        LabRequisition? requisition = null;
        if (request.RequisitionId.HasValue)
        {
            requisition = await query.FirstOrDefaultAsync(r => r.Id == request.RequisitionId.Value, cancellationToken);
        }
        else if (!string.IsNullOrWhiteSpace(request.AccessionNumber))
        {
            requisition = await query.FirstOrDefaultAsync(r => r.AccessionNumber == request.AccessionNumber.Trim(), cancellationToken);
        }

        if (requisition == null)
        {
            return new List<PrintableTubeStickerDto>();
        }

        var stickers = new List<PrintableTubeStickerDto>();

        foreach (var spec in requisition.Specimens)
        {
            var (colorName, hexColor, requiredTests) = ResolveContainerDetails(spec.ContainerType);

            stickers.Add(new PrintableTubeStickerDto
            {
                Barcode = spec.Barcode,
                AccessionNumber = requisition.AccessionNumber,
                PatientName = requisition.PatientName,
                PatientGender = requisition.PatientGender,
                PatientAge = requisition.PatientAge,
                PhilHealthPin = requisition.PhilHealthPin,
                ContainerType = spec.ContainerType.ToString(),
                ContainerColor = colorName,
                HexColor = hexColor,
                SpecimenType = spec.SpecimenType,
                RequiredTests = !string.IsNullOrWhiteSpace(spec.Notes) ? spec.Notes : requiredTests,
                Urgency = requisition.Urgency,
                DrawnAt = spec.CollectedAt,
                PhlebotomistName = spec.CollectedByPhlebotomistName,
                RackLocation = !string.IsNullOrWhiteSpace(spec.RackId) ? $"{spec.RackId} / {spec.RackPosition}" : null
            });
        }

        return stickers;
    }

    private static (string ColorName, string HexColor, string DefaultTests) ResolveContainerDetails(SpecimenContainerType containerType)
    {
        return containerType switch
        {
            SpecimenContainerType.Purple_EDTA => ("Lavender / EDTA", "#7C3AED", "CBC, Differential, Platelets, HbA1c"),
            SpecimenContainerType.Yellow_SST => ("Gold / SST Gel", "#D97706", "FBS, Lipid Profile, Creatinine, LFT, Electrolytes"),
            SpecimenContainerType.LightBlue_Citrate => ("Light Blue / Citrate", "#0284C7", "PT, INR, aPTT, Coagulation Panel"),
            SpecimenContainerType.Urine_Cup => ("Teal / Sterile Cup", "#0D9488", "Routine Urinalysis & Microscopy"),
            SpecimenContainerType.Grey_Fluoride => ("Grey / Fluoride", "#4B5563", "Glucose Tolerance (OGTT), Lactate"),
            SpecimenContainerType.Red_Serum => ("Red / Plain Clot", "#DC2626", "Therapeutic Drugs, Blood Typing"),
            SpecimenContainerType.Stool_Vial => ("Brown / Stool Vial", "#92400E", "Routine Fecalysis, Occult Blood"),
            _ => ("Standard White", "#4B5563", "General Diagnostic Panel")
        };
    }
}
