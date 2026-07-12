# Use the official .NET 10.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy csproj files and restore dependencies
COPY ["MainPortalBE/MainPortalBE.Api/MainPortalBE.Api.csproj", "MainPortalBE/MainPortalBE.Api/"]
COPY ["MainPortalBE/MainPortalBE.Application/MainPortalBE.Application.csproj", "MainPortalBE/MainPortalBE.Application/"]
COPY ["MainPortalBE/MainPortalBE.Domain/MainPortalBE.Domain.csproj", "MainPortalBE/MainPortalBE.Domain/"]
COPY ["MainPortalBE/MainPortalBE.Infrastructure/MainPortalBE.Infrastructure.csproj", "MainPortalBE/MainPortalBE.Infrastructure/"]
COPY ["CLINICEZ.Shared/CLINICEZ.Shared.csproj", "CLINICEZ.Shared/"]

RUN dotnet restore "MainPortalBE/MainPortalBE.Api/MainPortalBE.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/MainPortalBE/MainPortalBE.Api"
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