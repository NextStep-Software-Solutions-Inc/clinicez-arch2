# Use the official .NET 10.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy global Directory.Build.props
COPY ["Directory.Build.props", "./"]

# Copy csproj files and restore dependencies
COPY ["services/organization-api/ClinicEz.Organization.Api/ClinicEz.Organization.Api.csproj", "services/organization-api/ClinicEz.Organization.Api/"]
COPY ["services/organization-api/ClinicEz.Organization.Application/ClinicEz.Organization.Application.csproj", "services/organization-api/ClinicEz.Organization.Application/"]
COPY ["services/organization-api/ClinicEz.Organization.Domain/ClinicEz.Organization.Domain.csproj", "services/organization-api/ClinicEz.Organization.Domain/"]
COPY ["services/organization-api/ClinicEz.Organization.Infrastructure/ClinicEz.Organization.Infrastructure.csproj", "services/organization-api/ClinicEz.Organization.Infrastructure/"]
COPY ["packages/shared-dotnet/ClinicEz.Shared.csproj", "packages/shared-dotnet/"]

RUN dotnet restore "services/organization-api/ClinicEz.Organization.Api/ClinicEz.Organization.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/services/organization-api/ClinicEz.Organization.Api"
RUN dotnet build "ClinicEz.Organization.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "ClinicEz.Organization.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080
EXPOSE 443

# Set the entry point
ENTRYPOINT ["dotnet", "ClinicEz.Organization.Api.dll"]