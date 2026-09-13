# Use the official .NET 10.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy global Directory.Build.props
COPY ["Directory.Build.props", "./"]

# Copy csproj files and restore dependencies
COPY ["services/clinic-api/ClinicDashboardBE.Api/ClinicDashboardBE.Api.csproj", "services/clinic-api/ClinicDashboardBE.Api/"]
COPY ["services/clinic-api/ClinicDashboardBE.Application/ClinicDashboardBE.Application.csproj", "services/clinic-api/ClinicDashboardBE.Application/"]
COPY ["services/clinic-api/ClinicDashboardBE.Domain/ClinicDashboardBE.Domain.csproj", "services/clinic-api/ClinicDashboardBE.Domain/"]
COPY ["services/clinic-api/ClinicDashboardBE.Infrastructure/ClinicDashboardBE.Infrastructure.csproj", "services/clinic-api/ClinicDashboardBE.Infrastructure/"]
COPY ["packages/shared-dotnet/CLINICEZ.Shared.csproj", "packages/shared-dotnet/"]

RUN dotnet restore "services/clinic-api/ClinicDashboardBE.Api/ClinicDashboardBE.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/services/clinic-api/ClinicDashboardBE.Api"
RUN dotnet build "ClinicDashboardBE.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "ClinicDashboardBE.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080
EXPOSE 443

# Set the entry point
ENTRYPOINT ["dotnet", "ClinicDashboardBE.Api.dll"]