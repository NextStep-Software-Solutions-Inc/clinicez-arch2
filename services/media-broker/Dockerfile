# Use the official .NET 10.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy global Directory.Build.props
COPY ["Directory.Build.props", "./"]

# Copy csproj files and restore dependencies
COPY ["services/media-broker/ClinicEz.MediaBroker.Api/ClinicEz.MediaBroker.Api.csproj", "services/media-broker/ClinicEz.MediaBroker.Api/"]
COPY ["services/media-broker/ClinicEz.MediaBroker.Application/ClinicEz.MediaBroker.Application.csproj", "services/media-broker/ClinicEz.MediaBroker.Application/"]
COPY ["services/media-broker/ClinicEz.MediaBroker.Domain/ClinicEz.MediaBroker.Domain.csproj", "services/media-broker/ClinicEz.MediaBroker.Domain/"]
COPY ["services/media-broker/ClinicEz.MediaBroker.Infrastructure/ClinicEz.MediaBroker.Infrastructure.csproj", "services/media-broker/ClinicEz.MediaBroker.Infrastructure/"]
COPY ["packages/shared-dotnet/ClinicEz.Shared.csproj", "packages/shared-dotnet/"]

RUN dotnet restore "services/media-broker/ClinicEz.MediaBroker.Api/ClinicEz.MediaBroker.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/services/media-broker/ClinicEz.MediaBroker.Api"
RUN dotnet build "ClinicEz.MediaBroker.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "ClinicEz.MediaBroker.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
RUN apt-get update && apt-get install -y --no-install-recommends libgssapi-krb5-2 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080
EXPOSE 443

# Set the entry point
ENTRYPOINT ["dotnet", "ClinicEz.MediaBroker.Api.dll"]
