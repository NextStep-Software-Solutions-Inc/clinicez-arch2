FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 8080
EXPOSE 8081

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["src/CLINICEZ.PhilHealth.Proxy/CLINICEZ.PhilHealth.Proxy.csproj", "src/CLINICEZ.PhilHealth.Proxy/"]
RUN dotnet restore "src/CLINICEZ.PhilHealth.Proxy/CLINICEZ.PhilHealth.Proxy.csproj"

COPY . .
WORKDIR "/src/src/CLINICEZ.PhilHealth.Proxy"
RUN dotnet build "CLINICEZ.PhilHealth.Proxy.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "CLINICEZ.PhilHealth.Proxy.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "CLINICEZ.PhilHealth.Proxy.dll"]
