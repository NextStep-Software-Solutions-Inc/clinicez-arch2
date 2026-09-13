# Use the official .NET 10.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy global Directory.Build.props
COPY ["Directory.Build.props", "./"]

# Copy csproj files and restore dependencies
COPY ["services/organization-api/OrganizationDashboardBE.Api/OrganizationDashboardBE.Api.csproj", "services/organization-api/OrganizationDashboardBE.Api/"]
COPY ["services/organization-api/OrganizationDashboardBE.Application/OrganizationDashboardBE.Application.csproj", "services/organization-api/OrganizationDashboardBE.Application/"]
COPY ["services/organization-api/OrganizationDashboardBE.Domain/OrganizationDashboardBE.Domain.csproj", "services/organization-api/OrganizationDashboardBE.Domain/"]
COPY ["services/organization-api/OrganizationDashboardBE.Infrastructure/OrganizationDashboardBE.Infrastructure.csproj", "services/organization-api/OrganizationDashboardBE.Infrastructure/"]
COPY ["packages/shared-dotnet/CLINICEZ.Shared.csproj", "packages/shared-dotnet/"]

RUN dotnet restore "services/organization-api/OrganizationDashboardBE.Api/OrganizationDashboardBE.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/services/organization-api/OrganizationDashboardBE.Api"
RUN dotnet build "OrganizationDashboardBE.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "OrganizationDashboardBE.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080
EXPOSE 443

# Set the entry point
ENTRYPOINT ["dotnet", "OrganizationDashboardBE.Api.dll"]