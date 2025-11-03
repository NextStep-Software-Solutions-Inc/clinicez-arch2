# Use the official .NET 9.0 SDK image to build the application
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy csproj files and restore dependencies
COPY ["Portal/Portal.Api/Portal.Api.csproj", "Portal/Portal.Api/"]
COPY ["Portal/Portal.Application/Portal.Application.csproj", "Portal/Portal.Application/"]
COPY ["Portal/Portal.Domain/Portal.Domain.csproj", "Portal/Portal.Domain/"]
COPY ["Portal/Portal.Infrastructure/Portal.Infrastructure.csproj", "Portal/Portal.Infrastructure/"]
COPY ["CLINICEZ.Shared/CLINICEZ.Shared.csproj", "CLINICEZ.Shared/"]

RUN dotnet restore "Portal/Portal.Api/Portal.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/Portal/Portal.Api"
RUN dotnet build "Portal.Api.csproj" -c Release -o /app/build

# Publish the application
RUN dotnet publish "Portal.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080
EXPOSE 443

# Set the entry point
ENTRYPOINT ["dotnet", "Portal.Api.dll"]