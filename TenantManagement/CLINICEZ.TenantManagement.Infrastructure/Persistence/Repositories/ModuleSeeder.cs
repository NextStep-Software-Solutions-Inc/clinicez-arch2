using CLINICEZ.TenantManagement.Domain.Entities;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CLINICEZ.TenantManagement.Infrastructure.Persistence.Repositories;

public class ModuleSeeder(IUnitOfWork _unitOfWork) : IBaseSeeder
{
    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        var modules = new List<Module>
        {
            new()
            {
                Key = "sams",
                Name = "Supply and Asset Management System",
                Description = "Manages inventory, stock monitoring, and issuance of supplies and assets.",
                IsActive = true
            },
            new()
            {
                Key = "planning",
                Name = "Planning",
                Description = "Handles planning and scheduling of procurement and related processes.",
                IsActive = true
            },
            new()
            {
                Key = "pms",
                Name = "Procurement Management System",
                Description = "Covers the full procurement process from requisition to purchase order and delivery.",
                IsActive = true
            },
            new()
            {
                Key = "ams",
                Name = "Account Management System",
                Description = "Manages user accounts, roles, and access control across the system.",
                IsActive = true
            },
        };

        var existingModules = await _unitOfWork.ModuleRepository.Query()
            .Select(m => m.Name)
            .ToListAsync(cancellationToken);

        var newModules = modules
            .Where(m => !existingModules.Any(e => e.Equals(m.Name, StringComparison.OrdinalIgnoreCase)))
            .ToList();

        if (newModules.Count != 0)
        {
            await _unitOfWork.ModuleRepository.AddRangeAsync(newModules, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }
    }
}
