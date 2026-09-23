# Stage 1: Build
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy global Directory.Build.props
COPY ["Directory.Build.props", "./"]

# Copy project files individually to leverage Docker layer caching during restore
COPY ["services/patient-api/ClinicEz.Patient.Api/ClinicEz.Patient.Api.csproj", "services/patient-api/ClinicEz.Patient.Api/"]
COPY ["services/patient-api/ClinicEz.Patient.Application/ClinicEz.Patient.Application.csproj", "services/patient-api/ClinicEz.Patient.Application/"]
COPY ["services/patient-api/ClinicEz.Patient.Domain/ClinicEz.Patient.Domain.csproj", "services/patient-api/ClinicEz.Patient.Domain/"]
COPY ["services/patient-api/ClinicEz.Patient.Infrastructure/ClinicEz.Patient.Infrastructure.csproj", "services/patient-api/ClinicEz.Patient.Infrastructure/"]
COPY ["packages/shared-dotnet/ClinicEz.Shared.csproj", "packages/shared-dotnet/"]

RUN dotnet restore "services/patient-api/ClinicEz.Patient.Api/ClinicEz.Patient.Api.csproj"

# Copy source and build
COPY . .
WORKDIR "/src/services/patient-api/ClinicEz.Patient.Api"
RUN dotnet build "ClinicEz.Patient.Api.csproj" -c Release -o /app/build

# Stage 2: Publish
RUN dotnet publish "ClinicEz.Patient.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Stage 3: Final runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

# Install Kerberos library required by Npgsql GSSAPI authentication
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*

# Use the built-in non-root user from the .NET runtime image (APP_UID)
USER $APP_UID

COPY --from=build /app/publish .

EXPOSE 8080
EXPOSE 443

ENTRYPOINT ["dotnet", "ClinicEz.Patient.Api.dll"]
