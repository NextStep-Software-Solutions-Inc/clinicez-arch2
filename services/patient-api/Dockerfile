# Stage 1: Build
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy global Directory.Build.props
COPY ["Directory.Build.props", "./"]

# Copy project files individually to leverage Docker layer caching during restore
COPY ["services/patient-api/PatientAppBE.Api/PatientAppBE.Api.csproj", "services/patient-api/PatientAppBE.Api/"]
COPY ["services/patient-api/PatientAppBE.Application/PatientAppBE.Application.csproj", "services/patient-api/PatientAppBE.Application/"]
COPY ["services/patient-api/PatientAppBE.Domain/PatientAppBE.Domain.csproj", "services/patient-api/PatientAppBE.Domain/"]
COPY ["services/patient-api/PatientAppBE.Infrastructure/PatientAppBE.Infrastructure.csproj", "services/patient-api/PatientAppBE.Infrastructure/"]
COPY ["packages/shared-dotnet/CLINICEZ.Shared.csproj", "packages/shared-dotnet/"]

RUN dotnet restore "services/patient-api/PatientAppBE.Api/PatientAppBE.Api.csproj"

# Copy source and build
COPY . .
WORKDIR "/src/services/patient-api/PatientAppBE.Api"
RUN dotnet build "PatientAppBE.Api.csproj" -c Release -o /app/build

# Stage 2: Publish
RUN dotnet publish "PatientAppBE.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Stage 3: Final runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

# Use the built-in non-root user from the .NET runtime image (APP_UID)
USER $APP_UID

COPY --from=build /app/publish .

EXPOSE 8080
EXPOSE 443

ENTRYPOINT ["dotnet", "PatientAppBE.Api.dll"]
