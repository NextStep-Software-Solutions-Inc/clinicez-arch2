# Use the official .NET 9.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy csproj files and restore dependencies
COPY ["PhilHealthProxy/PhilHealthProxy.Api/PhilHealthProxy.Api.csproj", "PhilHealthProxy/PhilHealthProxy.Api/"]
COPY ["PhilHealthProxy/PhilHealthProxy.Application/PhilHealthProxy.Application.csproj", "PhilHealthProxy/PhilHealthProxy.Application/"]
COPY ["PhilHealthProxy/PhilHealthProxy.Domain/PhilHealthProxy.Domain.csproj", "PhilHealthProxy/PhilHealthProxy.Domain/"]
COPY ["PhilHealthProxy/PhilHealthProxy.Infrastructure/PhilHealthProxy.Infrastructure.csproj", "PhilHealthProxy/PhilHealthProxy.Infrastructure/"]
COPY ["CLINICEZ.Shared/CLINICEZ.Shared.csproj", "CLINICEZ.Shared/"]

RUN dotnet restore "PhilHealthProxy/PhilHealthProxy.Api/PhilHealthProxy.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/PhilHealthProxy/PhilHealthProxy.Api"
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
