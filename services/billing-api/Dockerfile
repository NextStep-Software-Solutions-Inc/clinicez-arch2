# Use the official .NET 10.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy global Directory.Build.props
COPY ["Directory.Build.props", "./"]

# Copy csproj files and restore dependencies
COPY ["services/billing-api/ClinicEz.Billing.Api/ClinicEz.Billing.Api.csproj", "services/billing-api/ClinicEz.Billing.Api/"]
COPY ["services/billing-api/ClinicEz.Billing.Application/ClinicEz.Billing.Application.csproj", "services/billing-api/ClinicEz.Billing.Application/"]
COPY ["services/billing-api/ClinicEz.Billing.Domain/ClinicEz.Billing.Domain.csproj", "services/billing-api/ClinicEz.Billing.Domain/"]
COPY ["services/billing-api/ClinicEz.Billing.Infrastructure/ClinicEz.Billing.Infrastructure.csproj", "services/billing-api/ClinicEz.Billing.Infrastructure/"]
COPY ["packages/shared-dotnet/ClinicEz.Shared.csproj", "packages/shared-dotnet/"]

RUN dotnet restore "services/billing-api/ClinicEz.Billing.Api/ClinicEz.Billing.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/services/billing-api/ClinicEz.Billing.Api"
RUN dotnet build "ClinicEz.Billing.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "ClinicEz.Billing.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
RUN apt-get update && apt-get install -y --no-install-recommends libgssapi-krb5-2 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080

# Set the entry point
ENTRYPOINT ["dotnet", "ClinicEz.Billing.Api.dll"]
