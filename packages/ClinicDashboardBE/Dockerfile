# Use the official .NET 10.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy csproj files and restore dependencies
COPY ["ClinicDashboardBE/ClinicDashboardBE.Api/ClinicDashboardBE.Api.csproj", "ClinicDashboardBE/ClinicDashboardBE.Api/"]
COPY ["ClinicDashboardBE/ClinicDashboardBE.Application/ClinicDashboardBE.Application.csproj", "ClinicDashboardBE/ClinicDashboardBE.Application/"]
COPY ["ClinicDashboardBE/ClinicDashboardBE.Domain/ClinicDashboardBE.Domain.csproj", "ClinicDashboardBE/ClinicDashboardBE.Domain/"]
COPY ["ClinicDashboardBE/ClinicDashboardBE.Infrastructure/ClinicDashboardBE.Infrastructure.csproj", "ClinicDashboardBE/ClinicDashboardBE.Infrastructure/"]
COPY ["CLINICEZ.Shared/CLINICEZ.Shared.csproj", "CLINICEZ.Shared/"]

RUN dotnet restore "ClinicDashboardBE/ClinicDashboardBE.Api/ClinicDashboardBE.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/ClinicDashboardBE/ClinicDashboardBE.Api"
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