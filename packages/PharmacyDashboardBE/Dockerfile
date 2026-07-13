# Use the official .NET 10.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy csproj files and restore dependencies
COPY ["PharmacyDashboardBE/PharmacyDashboardBE.Api/PharmacyDashboardBE.Api.csproj", "PharmacyDashboardBE/PharmacyDashboardBE.Api/"]
COPY ["PharmacyDashboardBE/PharmacyDashboardBE.Application/PharmacyDashboardBE.Application.csproj", "PharmacyDashboardBE/PharmacyDashboardBE.Application/"]
COPY ["PharmacyDashboardBE/PharmacyDashboardBE.Domain/PharmacyDashboardBE.Domain.csproj", "PharmacyDashboardBE/PharmacyDashboardBE.Domain/"]
COPY ["PharmacyDashboardBE/PharmacyDashboardBE.Infrastructure/PharmacyDashboardBE.Infrastructure.csproj", "PharmacyDashboardBE/PharmacyDashboardBE.Infrastructure/"]
COPY ["CLINICEZ.Shared/CLINICEZ.Shared.csproj", "CLINICEZ.Shared/"]

RUN dotnet restore "PharmacyDashboardBE/PharmacyDashboardBE.Api/PharmacyDashboardBE.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/PharmacyDashboardBE/PharmacyDashboardBE.Api"
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