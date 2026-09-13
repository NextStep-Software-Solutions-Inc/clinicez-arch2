# Use the official .NET 10.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy global Directory.Build.props
COPY ["Directory.Build.props", "./"]

# Copy csproj files and restore dependencies
COPY ["services/pharmacy-api/ClinicEz.Pharmacy.Api/ClinicEz.Pharmacy.Api.csproj", "services/pharmacy-api/ClinicEz.Pharmacy.Api/"]
COPY ["services/pharmacy-api/ClinicEz.Pharmacy.Application/ClinicEz.Pharmacy.Application.csproj", "services/pharmacy-api/ClinicEz.Pharmacy.Application/"]
COPY ["services/pharmacy-api/ClinicEz.Pharmacy.Domain/ClinicEz.Pharmacy.Domain.csproj", "services/pharmacy-api/ClinicEz.Pharmacy.Domain/"]
COPY ["services/pharmacy-api/ClinicEz.Pharmacy.Infrastructure/ClinicEz.Pharmacy.Infrastructure.csproj", "services/pharmacy-api/ClinicEz.Pharmacy.Infrastructure/"]
COPY ["packages/shared-dotnet/ClinicEz.Shared.csproj", "packages/shared-dotnet/"]

RUN dotnet restore "services/pharmacy-api/ClinicEz.Pharmacy.Api/ClinicEz.Pharmacy.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/services/pharmacy-api/ClinicEz.Pharmacy.Api"
RUN dotnet build "ClinicEz.Pharmacy.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "ClinicEz.Pharmacy.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080
EXPOSE 443

# Set the entry point
ENTRYPOINT ["dotnet", "ClinicEz.Pharmacy.Api.dll"]