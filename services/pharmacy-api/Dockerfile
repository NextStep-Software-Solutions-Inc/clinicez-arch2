# Use the official .NET 10.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy global Directory.Build.props
COPY ["Directory.Build.props", "./"]

# Copy csproj files and restore dependencies
COPY ["services/pharmacy-api/PharmacyDashboardBE.Api/PharmacyDashboardBE.Api.csproj", "services/pharmacy-api/PharmacyDashboardBE.Api/"]
COPY ["services/pharmacy-api/PharmacyDashboardBE.Application/PharmacyDashboardBE.Application.csproj", "services/pharmacy-api/PharmacyDashboardBE.Application/"]
COPY ["services/pharmacy-api/PharmacyDashboardBE.Domain/PharmacyDashboardBE.Domain.csproj", "services/pharmacy-api/PharmacyDashboardBE.Domain/"]
COPY ["services/pharmacy-api/PharmacyDashboardBE.Infrastructure/PharmacyDashboardBE.Infrastructure.csproj", "services/pharmacy-api/PharmacyDashboardBE.Infrastructure/"]
COPY ["packages/shared-dotnet/CLINICEZ.Shared.csproj", "packages/shared-dotnet/"]

RUN dotnet restore "services/pharmacy-api/PharmacyDashboardBE.Api/PharmacyDashboardBE.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/services/pharmacy-api/PharmacyDashboardBE.Api"
RUN dotnet build "PharmacyDashboardBE.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "PharmacyDashboardBE.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080
EXPOSE 443

# Set the entry point
ENTRYPOINT ["dotnet", "PharmacyDashboardBE.Api.dll"]