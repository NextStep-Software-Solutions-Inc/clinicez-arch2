# Use the official .NET 10.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy global Directory.Build.props
COPY ["Directory.Build.props", "./"]

# Copy csproj files and restore dependencies
COPY ["services/comms-api/ClinicEz.Comms.Api/ClinicEz.Comms.Api.csproj", "services/comms-api/ClinicEz.Comms.Api/"]
COPY ["services/comms-api/ClinicEz.Comms.Application/ClinicEz.Comms.Application.csproj", "services/comms-api/ClinicEz.Comms.Application/"]
COPY ["services/comms-api/ClinicEz.Comms.Domain/ClinicEz.Comms.Domain.csproj", "services/comms-api/ClinicEz.Comms.Domain/"]
COPY ["services/comms-api/ClinicEz.Comms.Infrastructure/ClinicEz.Comms.Infrastructure.csproj", "services/comms-api/ClinicEz.Comms.Infrastructure/"]
COPY ["packages/shared-dotnet/ClinicEz.Shared.csproj", "packages/shared-dotnet/"]

RUN dotnet restore "services/comms-api/ClinicEz.Comms.Api/ClinicEz.Comms.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/services/comms-api/ClinicEz.Comms.Api"
RUN dotnet build "ClinicEz.Comms.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "ClinicEz.Comms.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
RUN apt-get update && apt-get install -y --no-install-recommends libgssapi-krb5-2 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080
EXPOSE 443

# Set the entry point
ENTRYPOINT ["dotnet", "ClinicEz.Comms.Api.dll"]
