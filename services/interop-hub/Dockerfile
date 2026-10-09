# Use the official .NET 10.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy global Directory.Build.props
COPY ["Directory.Build.props", "./"]

# Copy csproj files and restore dependencies
COPY ["services/interop-hub/ClinicEz.Interop.Api/ClinicEz.Interop.Api.csproj", "services/interop-hub/ClinicEz.Interop.Api/"]
COPY ["services/interop-hub/ClinicEz.Interop.Application/ClinicEz.Interop.Application.csproj", "services/interop-hub/ClinicEz.Interop.Application/"]
COPY ["services/interop-hub/ClinicEz.Interop.Domain/ClinicEz.Interop.Domain.csproj", "services/interop-hub/ClinicEz.Interop.Domain/"]
COPY ["services/interop-hub/ClinicEz.Interop.Infrastructure/ClinicEz.Interop.Infrastructure.csproj", "services/interop-hub/ClinicEz.Interop.Infrastructure/"]
COPY ["packages/shared-dotnet/ClinicEz.Shared.csproj", "packages/shared-dotnet/"]

RUN dotnet restore "services/interop-hub/ClinicEz.Interop.Api/ClinicEz.Interop.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/services/interop-hub/ClinicEz.Interop.Api"
RUN dotnet build "ClinicEz.Interop.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "ClinicEz.Interop.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
RUN apt-get update && apt-get install -y --no-install-recommends libgssapi-krb5-2 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080

# Set the entry point
ENTRYPOINT ["dotnet", "ClinicEz.Interop.Api.dll"]
