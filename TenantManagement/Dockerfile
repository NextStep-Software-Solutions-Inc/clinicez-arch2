# Use the official .NET 9.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy csproj files and restore dependencies
COPY ["TenantManagement/ERPEZ.TenantManagement.Api/ERPEZ.TenantManagement.Api.csproj", "TenantManagement/ERPEZ.TenantManagement.Api/"]
COPY ["TenantManagement/ERPEZ.TenantManagement.Application/ERPEZ.TenantManagement.Application.csproj", "TenantManagement/ERPEZ.TenantManagement.Application/"]
COPY ["TenantManagement/ERPEZ.TenantManagement.Domain/ERPEZ.TenantManagement.Domain.csproj", "TenantManagement/ERPEZ.TenantManagement.Domain/"]
COPY ["TenantManagement/ERPEZ.TenantManagement.Infrastructure/ERPEZ.TenantManagement.Infrastructure.csproj", "TenantManagement/ERPEZ.TenantManagement.Infrastructure/"]
COPY ["ERPEZ.Shared/ERPEZ.Shared.csproj", "ERPEZ.Shared/"]

RUN dotnet restore "TenantManagement/ERPEZ.TenantManagement.Api/ERPEZ.TenantManagement.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/TenantManagement/ERPEZ.TenantManagement.Api"
RUN dotnet build "ERPEZ.TenantManagement.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "ERPEZ.TenantManagement.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080
EXPOSE 443

# Set the entry point
ENTRYPOINT ["dotnet", "ERPEZ.TenantManagement.Api.dll"]