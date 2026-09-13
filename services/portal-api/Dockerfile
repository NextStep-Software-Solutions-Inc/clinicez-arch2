# Use the official .NET 10.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy global Directory.Build.props
COPY ["Directory.Build.props", "./"]

# Copy csproj files and restore dependencies
COPY ["services/portal-api/MainPortalBE.Api/MainPortalBE.Api.csproj", "services/portal-api/MainPortalBE.Api/"]
COPY ["services/portal-api/MainPortalBE.Application/MainPortalBE.Application.csproj", "services/portal-api/MainPortalBE.Application/"]
COPY ["services/portal-api/MainPortalBE.Domain/MainPortalBE.Domain.csproj", "services/portal-api/MainPortalBE.Domain/"]
COPY ["services/portal-api/MainPortalBE.Infrastructure/MainPortalBE.Infrastructure.csproj", "services/portal-api/MainPortalBE.Infrastructure/"]
COPY ["packages/shared-dotnet/CLINICEZ.Shared.csproj", "packages/shared-dotnet/"]

RUN dotnet restore "services/portal-api/MainPortalBE.Api/MainPortalBE.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/services/portal-api/MainPortalBE.Api"
RUN dotnet build "MainPortalBE.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "MainPortalBE.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080
EXPOSE 443

# Set the entry point
ENTRYPOINT ["dotnet", "MainPortalBE.Api.dll"]