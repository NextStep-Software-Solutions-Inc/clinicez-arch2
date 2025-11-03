# Use the official .NET 9.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy csproj files and restore dependencies
COPY ["ERPEZ/ERPEZ.Api/ERPEZ.Api.csproj", "ERPEZ/ERPEZ.Api/"]
COPY ["ERPEZ/ERPEZ.Application/ERPEZ.Application.csproj", "ERPEZ/ERPEZ.Application/"]
COPY ["ERPEZ/ERPEZ.Domain/ERPEZ.Domain.csproj", "ERPEZ/ERPEZ.Domain/"]
COPY ["ERPEZ/ERPEZ.Infrastructure/ERPEZ.Infrastructure.csproj", "ERPEZ/ERPEZ.Infrastructure/"]
COPY ["ERPEZ.Shared/ERPEZ.Shared.csproj", "ERPEZ.Shared/"]

RUN dotnet restore "ERPEZ/ERPEZ.Api/ERPEZ.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/ERPEZ/ERPEZ.Api"
RUN dotnet build "ERPEZ.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "ERPEZ.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080
EXPOSE 443

# Set the entry point
ENTRYPOINT ["dotnet", "ERPEZ.Api.dll"]