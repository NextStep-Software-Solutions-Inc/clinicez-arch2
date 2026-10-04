# Use the official .NET 10.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy global Directory.Build.props
COPY ["Directory.Build.props", "./"]

# Copy csproj files and restore dependencies
COPY ["services/philhealth-proxy/ClinicEz.PhilHealthProxy.Api/ClinicEz.PhilHealthProxy.Api.csproj", "services/philhealth-proxy/ClinicEz.PhilHealthProxy.Api/"]
COPY ["services/philhealth-proxy/ClinicEz.PhilHealthProxy.Application/ClinicEz.PhilHealthProxy.Application.csproj", "services/philhealth-proxy/ClinicEz.PhilHealthProxy.Application/"]
COPY ["services/philhealth-proxy/ClinicEz.PhilHealthProxy.Domain/ClinicEz.PhilHealthProxy.Domain.csproj", "services/philhealth-proxy/ClinicEz.PhilHealthProxy.Domain/"]
COPY ["services/philhealth-proxy/ClinicEz.PhilHealthProxy.Infrastructure/ClinicEz.PhilHealthProxy.Infrastructure.csproj", "services/philhealth-proxy/ClinicEz.PhilHealthProxy.Infrastructure/"]
COPY ["packages/shared-dotnet/ClinicEz.Shared.csproj", "packages/shared-dotnet/"]

RUN dotnet restore "services/philhealth-proxy/ClinicEz.PhilHealthProxy.Api/ClinicEz.PhilHealthProxy.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/services/philhealth-proxy/ClinicEz.PhilHealthProxy.Api"
RUN dotnet build "ClinicEz.PhilHealthProxy.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "ClinicEz.PhilHealthProxy.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

EXPOSE 8080
EXPOSE 443

ENTRYPOINT ["dotnet", "ClinicEz.PhilHealthProxy.Api.dll"]
