FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY ["Directory.Build.props", "./"]
COPY ["services/v1-sync-api/ClinicEz.V1Sync.Api/ClinicEz.V1Sync.Api.csproj", "services/v1-sync-api/ClinicEz.V1Sync.Api/"]
COPY ["packages/shared-dotnet/ClinicEz.Shared.csproj", "packages/shared-dotnet/"]

RUN dotnet restore "services/v1-sync-api/ClinicEz.V1Sync.Api/ClinicEz.V1Sync.Api.csproj"

COPY . .
WORKDIR "/src/services/v1-sync-api/ClinicEz.V1Sync.Api"
RUN dotnet publish "ClinicEz.V1Sync.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
RUN apt-get update && apt-get install -y --no-install-recommends libgssapi-krb5-2 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/publish .

EXPOSE 8080
ENTRYPOINT ["dotnet", "ClinicEz.V1Sync.Api.dll"]
