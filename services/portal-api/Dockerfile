# Use the official .NET 10.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy global Directory.Build.props
COPY ["Directory.Build.props", "./"]

# Copy csproj files and restore dependencies
COPY ["services/portal-api/ClinicEz.Portal.Api/ClinicEz.Portal.Api.csproj", "services/portal-api/ClinicEz.Portal.Api/"]
COPY ["services/portal-api/ClinicEz.Portal.Application/ClinicEz.Portal.Application.csproj", "services/portal-api/ClinicEz.Portal.Application/"]
COPY ["services/portal-api/ClinicEz.Portal.Domain/ClinicEz.Portal.Domain.csproj", "services/portal-api/ClinicEz.Portal.Domain/"]
COPY ["services/portal-api/ClinicEz.Portal.Infrastructure/ClinicEz.Portal.Infrastructure.csproj", "services/portal-api/ClinicEz.Portal.Infrastructure/"]
COPY ["packages/shared-dotnet/ClinicEz.Shared.csproj", "packages/shared-dotnet/"]

RUN dotnet restore "services/portal-api/ClinicEz.Portal.Api/ClinicEz.Portal.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/services/portal-api/ClinicEz.Portal.Api"
RUN dotnet build "ClinicEz.Portal.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "ClinicEz.Portal.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080
EXPOSE 443

# Set the entry point
ENTRYPOINT ["dotnet", "ClinicEz.Portal.Api.dll"]