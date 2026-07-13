# Use the official .NET 9.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy csproj files and restore dependencies
COPY ["OrganizationDashboardBE/OrganizationDashboardBE.Api/OrganizationDashboardBE.Api.csproj", "OrganizationDashboardBE/OrganizationDashboardBE.Api/"]
COPY ["OrganizationDashboardBE/OrganizationDashboardBE.Application/OrganizationDashboardBE.Application.csproj", "OrganizationDashboardBE/OrganizationDashboardBE.Application/"]
COPY ["OrganizationDashboardBE/OrganizationDashboardBE.Domain/OrganizationDashboardBE.Domain.csproj", "OrganizationDashboardBE/OrganizationDashboardBE.Domain/"]
COPY ["OrganizationDashboardBE/OrganizationDashboardBE.Infrastructure/OrganizationDashboardBE.Infrastructure.csproj", "OrganizationDashboardBE/OrganizationDashboardBE.Infrastructure/"]
COPY ["CLINICEZ.Shared/CLINICEZ.Shared.csproj", "CLINICEZ.Shared/"]

RUN dotnet restore "OrganizationDashboardBE/OrganizationDashboardBE.Api/OrganizationDashboardBE.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/OrganizationDashboardBE/OrganizationDashboardBE.Api"
RUN dotnet build "OrganizationDashboardBE.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "OrganizationDashboardBE.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080
EXPOSE 443

# Set the entry point
ENTRYPOINT ["dotnet", "OrganizationDashboardBE.Api.dll"]