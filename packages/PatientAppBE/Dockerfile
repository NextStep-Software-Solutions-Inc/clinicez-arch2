# Stage 1: Build
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy project files individually to leverage Docker layer caching during restore
COPY ["PatientAppBE/PatientAppBE.Api/PatientAppBE.Api.csproj", "PatientAppBE/PatientAppBE.Api/"]
COPY ["PatientAppBE/PatientAppBE.Application/PatientAppBE.Application.csproj", "PatientAppBE/PatientAppBE.Application/"]
COPY ["PatientAppBE/PatientAppBE.Domain/PatientAppBE.Domain.csproj", "PatientAppBE/PatientAppBE.Domain/"]
COPY ["PatientAppBE/PatientAppBE.Infrastructure/PatientAppBE.Infrastructure.csproj", "PatientAppBE/PatientAppBE.Infrastructure/"]
COPY ["Clinic EZ.Shared/Clinic EZ.Shared.csproj", "Clinic EZ.Shared/"]

RUN dotnet restore "PatientAppBE/PatientAppBE.Api/PatientAppBE.Api.csproj"

# Copy source and build
COPY . .
WORKDIR "/src/PatientAppBE/PatientAppBE.Api"
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
