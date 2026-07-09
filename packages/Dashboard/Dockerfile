# Use the official .NET 9.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy csproj files and restore dependencies
COPY ["Dashboard/Dashboard.Api/Dashboard.Api.csproj", "Dashboard/Dashboard.Api/"]
COPY ["Dashboard/Dashboard.Application/Dashboard.Application.csproj", "Dashboard/Dashboard.Application/"]
COPY ["Dashboard/Dashboard.Domain/Dashboard.Domain.csproj", "Dashboard/Dashboard.Domain/"]
COPY ["Dashboard/Dashboard.Infrastructure/Dashboard.Infrastructure.csproj", "Dashboard/Dashboard.Infrastructure/"]
COPY ["CLINICEZ.Shared/CLINICEZ.Shared.csproj", "CLINICEZ.Shared/"]

RUN dotnet restore "Dashboard/Dashboard.Api/Dashboard.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/Dashboard/Dashboard.Api"
RUN dotnet build "Dashboard.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "Dashboard.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080
EXPOSE 443

# Set the entry point
ENTRYPOINT ["dotnet", "Dashboard.Api.dll"]