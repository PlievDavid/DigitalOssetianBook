# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY NuGet.Config ./
COPY IronLanguage.Db/IronLanguage.Db.csproj IronLanguage.Db/
COPY IronLanguage.Web/IronLanguage.Web.csproj IronLanguage.Web/
RUN dotnet restore IronLanguage.Web/IronLanguage.Web.csproj --configfile NuGet.Config

COPY IronLanguage.Db/ IronLanguage.Db/
COPY IronLanguage.Web/ IronLanguage.Web/
RUN dotnet publish IronLanguage.Web/IronLanguage.Web.csproj -c Release --no-restore -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
RUN mkdir -p /app/keys /app/wwwroot/media && chown -R app:app /app/keys /app/wwwroot/media
COPY --from=build --chown=app:app /app/publish ./
USER app
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "IronLanguage.Web.dll"]
