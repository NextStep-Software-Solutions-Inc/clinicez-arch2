# Use the official .NET 10.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy global Directory.Build.props
COPY ["Directory.Build.props", "./"]

# Copy csproj files and restore dependencies
COPY ["services/clinic-api/ClinicEz.Clinic.Api/ClinicEz.Clinic.Api.csproj", "services/clinic-api/ClinicEz.Clinic.Api/"]
COPY ["services/clinic-api/ClinicEz.Clinic.Application/ClinicEz.Clinic.Application.csproj", "services/clinic-api/ClinicEz.Clinic.Application/"]
COPY ["services/clinic-api/ClinicEz.Clinic.Domain/ClinicEz.Clinic.Domain.csproj", "services/clinic-api/ClinicEz.Clinic.Domain/"]
COPY ["services/clinic-api/ClinicEz.Clinic.Infrastructure/ClinicEz.Clinic.Infrastructure.csproj", "services/clinic-api/ClinicEz.Clinic.Infrastructure/"]
COPY ["packages/shared-dotnet/ClinicEz.Shared.csproj", "packages/shared-dotnet/"]

RUN dotnet restore "services/clinic-api/ClinicEz.Clinic.Api/ClinicEz.Clinic.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/services/clinic-api/ClinicEz.Clinic.Api"
RUN dotnet build "ClinicEz.Clinic.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "ClinicEz.Clinic.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
RUN apt-get update && apt-get install -y --no-install-recommends libgssapi-krb5-2 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080
EXPOSE 443

# Set the entry point
ENTRYPOINT ["dotnet", "ClinicEz.Clinic.Api.dll"]