# Use the official .NET 9.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy csproj files and restore dependencies
COPY ["LaboratoryDashboardBE/LaboratoryDashboardBE.Api/LaboratoryDashboardBE.Api.csproj", "LaboratoryDashboardBE/LaboratoryDashboardBE.Api/"]
COPY ["LaboratoryDashboardBE/LaboratoryDashboardBE.Application/LaboratoryDashboardBE.Application.csproj", "LaboratoryDashboardBE/LaboratoryDashboardBE.Application/"]
COPY ["LaboratoryDashboardBE/LaboratoryDashboardBE.Domain/LaboratoryDashboardBE.Domain.csproj", "LaboratoryDashboardBE/LaboratoryDashboardBE.Domain/"]
COPY ["LaboratoryDashboardBE/LaboratoryDashboardBE.Infrastructure/LaboratoryDashboardBE.Infrastructure.csproj", "LaboratoryDashboardBE/LaboratoryDashboardBE.Infrastructure/"]
COPY ["CLINICEZ.Shared/CLINICEZ.Shared.csproj", "CLINICEZ.Shared/"]

RUN dotnet restore "LaboratoryDashboardBE/LaboratoryDashboardBE.Api/LaboratoryDashboardBE.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/LaboratoryDashboardBE/LaboratoryDashboardBE.Api"
RUN dotnet build "LaboratoryDashboardBE.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "LaboratoryDashboardBE.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080
EXPOSE 443

# Set the entry point
ENTRYPOINT ["dotnet", "LaboratoryDashboardBE.Api.dll"]