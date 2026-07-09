# Stage 1: Build
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy project files individually to leverage Docker layer caching during restore
COPY ["PatientAppBE/PatientApp.Api/PatientApp.Api.csproj", "PatientAppBE/PatientApp.Api/"]
COPY ["PatientAppBE/PatientApp.Application/PatientApp.Application.csproj", "PatientAppBE/PatientApp.Application/"]
COPY ["PatientAppBE/PatientApp.Domain/PatientApp.Domain.csproj", "PatientAppBE/PatientApp.Domain/"]
COPY ["PatientAppBE/PatientApp.Infrastructure/PatientApp.Infrastructure.csproj", "PatientAppBE/PatientApp.Infrastructure/"]
COPY ["CLINICEZ.Shared/CLINICEZ.Shared.csproj", "CLINICEZ.Shared/"]

RUN dotnet restore "PatientAppBE/PatientApp.Api/PatientApp.Api.csproj"

# Copy source and build
COPY . .
WORKDIR "/src/PatientAppBE/PatientApp.Api"
RUN dotnet build "PatientApp.Api.csproj" -c Release -o /app/build

# Stage 2: Publish
RUN dotnet publish "PatientApp.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Stage 3: Final runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

# Use the built-in non-root user from the .NET runtime image (APP_UID)
USER $APP_UID

COPY --from=build /app/publish .

EXPOSE 8080
EXPOSE 443

ENTRYPOINT ["dotnet", "PatientApp.Api.dll"]
