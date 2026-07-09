# Use the official .NET 9.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy csproj files and restore dependencies
COPY ["Portal/MainPortalBE.Api/MainPortalBE.Api.csproj", "Portal/MainPortalBE.Api/"]
COPY ["Portal/MainPortalBE.Application/MainPortalBE.Application.csproj", "Portal/MainPortalBE.Application/"]
COPY ["Portal/MainPortalBE.Domain/MainPortalBE.Domain.csproj", "Portal/MainPortalBE.Domain/"]
COPY ["Portal/MainPortalBE.Infrastructure/MainPortalBE.Infrastructure.csproj", "Portal/MainPortalBE.Infrastructure/"]
COPY ["Clinic EZ.Shared/Clinic EZ.Shared.csproj", "Clinic EZ.Shared/"]

RUN dotnet restore "Portal/MainPortalBE.Api/MainPortalBE.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/Portal/MainPortalBE.Api"
RUN dotnet build "MainPortalBE.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "MainPortalBE.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080
EXPOSE 443

# Set the entry point
ENTRYPOINT ["dotnet", "MainPortalBE.Api.dll"]