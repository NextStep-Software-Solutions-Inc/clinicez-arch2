# Use the official .NET 10.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy global Directory.Build.props
COPY ["Directory.Build.props", "./"]

# Copy csproj files and restore dependencies
COPY ["services/laboratory-api/LaboratoryDashboardBE.Api/LaboratoryDashboardBE.Api.csproj", "services/laboratory-api/LaboratoryDashboardBE.Api/"]
COPY ["services/laboratory-api/LaboratoryDashboardBE.Application/LaboratoryDashboardBE.Application.csproj", "services/laboratory-api/LaboratoryDashboardBE.Application/"]
COPY ["services/laboratory-api/LaboratoryDashboardBE.Domain/LaboratoryDashboardBE.Domain.csproj", "services/laboratory-api/LaboratoryDashboardBE.Domain/"]
COPY ["services/laboratory-api/LaboratoryDashboardBE.Infrastructure/LaboratoryDashboardBE.Infrastructure.csproj", "services/laboratory-api/LaboratoryDashboardBE.Infrastructure/"]
COPY ["packages/shared-dotnet/CLINICEZ.Shared.csproj", "packages/shared-dotnet/"]

RUN dotnet restore "services/laboratory-api/LaboratoryDashboardBE.Api/LaboratoryDashboardBE.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/services/laboratory-api/LaboratoryDashboardBE.Api"
RUN dotnet build "LaboratoryDashboardBE.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "LaboratoryDashboardBE.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080
EXPOSE 443

# Set the entry point
ENTRYPOINT ["dotnet", "LaboratoryDashboardBE.Api.dll"]