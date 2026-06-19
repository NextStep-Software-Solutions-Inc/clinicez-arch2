# Stage 1: Build
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy project files individually to leverage Docker layer caching during restore
COPY ["PatientApp/PatientApp.Api/PatientApp.Api.csproj", "PatientApp/PatientApp.Api/"]
COPY ["PatientApp/PatientApp.Application/PatientApp.Application.csproj", "PatientApp/PatientApp.Application/"]
COPY ["PatientApp/PatientApp.Domain/PatientApp.Domain.csproj", "PatientApp/PatientApp.Domain/"]
COPY ["PatientApp/PatientApp.Infrastructure/PatientApp.Infrastructure.csproj", "PatientApp/PatientApp.Infrastructure/"]
COPY ["CLINICEZ.Shared/CLINICEZ.Shared.csproj", "CLINICEZ.Shared/"]

RUN dotnet restore "PatientApp/PatientApp.Api/PatientApp.Api.csproj"

# Copy source and build
COPY . .
WORKDIR "/src/PatientApp/PatientApp.Api"
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
