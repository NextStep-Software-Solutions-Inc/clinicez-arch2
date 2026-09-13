# Use the official .NET 10.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy global Directory.Build.props
COPY ["Directory.Build.props", "./"]

# Copy csproj files and restore dependencies
COPY ["services/laboratory-api/ClinicEz.Laboratory.Api/ClinicEz.Laboratory.Api.csproj", "services/laboratory-api/ClinicEz.Laboratory.Api/"]
COPY ["services/laboratory-api/ClinicEz.Laboratory.Application/ClinicEz.Laboratory.Application.csproj", "services/laboratory-api/ClinicEz.Laboratory.Application/"]
COPY ["services/laboratory-api/ClinicEz.Laboratory.Domain/ClinicEz.Laboratory.Domain.csproj", "services/laboratory-api/ClinicEz.Laboratory.Domain/"]
COPY ["services/laboratory-api/ClinicEz.Laboratory.Infrastructure/ClinicEz.Laboratory.Infrastructure.csproj", "services/laboratory-api/ClinicEz.Laboratory.Infrastructure/"]
COPY ["packages/shared-dotnet/ClinicEz.Shared.csproj", "packages/shared-dotnet/"]

RUN dotnet restore "services/laboratory-api/ClinicEz.Laboratory.Api/ClinicEz.Laboratory.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/services/laboratory-api/ClinicEz.Laboratory.Api"
RUN dotnet build "ClinicEz.Laboratory.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "ClinicEz.Laboratory.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080
EXPOSE 443

# Set the entry point
ENTRYPOINT ["dotnet", "ClinicEz.Laboratory.Api.dll"]