# Use the official .NET 9.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy global Directory.Build.props
COPY ["Directory.Build.props", "./"]

# Copy csproj files and restore dependencies
COPY ["services/philhealth-proxy/PhilHealthProxy.Api/PhilHealthProxy.Api.csproj", "services/philhealth-proxy/PhilHealthProxy.Api/"]
COPY ["services/philhealth-proxy/PhilHealthProxy.Application/PhilHealthProxy.Application.csproj", "services/philhealth-proxy/PhilHealthProxy.Application/"]
COPY ["services/philhealth-proxy/PhilHealthProxy.Domain/PhilHealthProxy.Domain.csproj", "services/philhealth-proxy/PhilHealthProxy.Domain/"]
COPY ["services/philhealth-proxy/PhilHealthProxy.Infrastructure/PhilHealthProxy.Infrastructure.csproj", "services/philhealth-proxy/PhilHealthProxy.Infrastructure/"]
COPY ["packages/shared-dotnet/CLINICEZ.Shared.csproj", "packages/shared-dotnet/"]

RUN dotnet restore "services/philhealth-proxy/PhilHealthProxy.Api/PhilHealthProxy.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/services/philhealth-proxy/PhilHealthProxy.Api"
RUN dotnet build "PhilHealthProxy.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "PhilHealthProxy.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

EXPOSE 8080
EXPOSE 443

ENTRYPOINT ["dotnet", "PhilHealthProxy.Api.dll"]
