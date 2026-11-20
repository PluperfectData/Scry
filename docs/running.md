# Running Scry

[Documentation](README.md) › Running Scry

## Starting the API and the client

Start Mailpit, which keeps the mail the API sends and shows it at `http://localhost:8025`. Then start the API and the
client, and open `http://localhost:6160/install`.

```bash
mailpit
```

```bash
dotnet run --project Server/src/Scry.Api
```

```bash
npm --prefix Client install
```

```bash
npm --prefix Client run dev
```

The API listens on `http://localhost:6161`. The client listens on `http://localhost:6160` and reads the API's address from
`VITE_API_URL`, set in `Client/.env.development`.

## In Docker, with the -dev containers

Instead of installing .NET, MySQL, and Mailpit, the code can run in containers, in Development as from the code,
with Caddy serving the site and the API over HTTPS, as [Docker](docker.md) does. With Docker running, double-click
`Scry Dev.cmd` on Windows, or run `sh scry-dev.sh` on macOS or Linux. The launcher:

1. Fetches Nexus, Pluperfect.Jwt, and Pluperfect.Mail beside Scry with Git, when they aren't there. Scry's API builds
   with Nexus's connector library.
2. Asks whether to start Nexus's -dev containers too, linked to Scry.
3. Makes the database's password the first time, in `.env.dev` beside `compose.dev.yaml`, which git ignores.
4. Builds the images from `Dockerfile.dev`, starts the containers, and waits until the API and the site answer. The
   first build takes several minutes.
5. Asks the computer to trust the authority behind Caddy's certificates, the first time, and Nexus's too when it runs.
6. Prints the installer's address with its install code while Scry isn't set up.
7. Opens `https://localhost:6160`, and ends.

| Container | What |
|---|---|
| `scry-caddy-dev` | Caddy, serving the site at `https://localhost:6160` and the API at `https://localhost:6161` |
| `scry-api-dev` | The API, under `dotnet run`, in Development, which browsers reach only through Caddy |
| `scry-web-dev` | The site, under Vite's dev server, which browsers reach only through Caddy |
| `scry-db-dev` | MySQL, at 127.0.0.1, port 6166, for MySQL Workbench or the `mysql` client, as `scry`, with the `SCRY_DEV_DB_PASSWORD` in `.env.dev` |
| `scry-mail-dev` | Mailpit, at `http://localhost:6162` |

Caddy makes the certificates from an authority of its own, kept in the `scry-dev-caddy` volume, apart from Docker's.
The launcher asks the computer to trust it as Docker's launcher does; see [Certificates](docker.md#certificates).
Docker Desktop's links open `http://127.0.0.1:6160`, which Caddy sends on to `https://localhost:6160`, where the site's
cookies and the API's allowed origin apply. Since every browser request reaches the API through Caddy,
`compose.dev.yaml` sets `Scry__Proxied`, and the site's dev server is given the API's https address in place of the one
in `Client/.env.development`.

With Nexus's beside them, Scry's link form starts with `http://nexus-api-dev:6163`, and Scry tells Nexus to push rows
to `http://scry-api-dev:6161`, as in [Running both](docker.md#running-both). Nexus is at `https://localhost:6165`.

Each container copies in the code as saved when it starts, from read-only mounts of the folders: `scry-api-dev` the
API's project, Nexus's connector library, and Pluperfect.Jwt's and Pluperfect.Mail's projects, and `scry-web-dev` the
client's `src` and `public` folders, `index.html`, `vite.config.ts`, and `.env.development`. Nothing watches for
changes. To see a saved change, restart its container, from Docker Desktop or with
`docker restart scry-api-dev scry-web-dev`. The API builds again as it starts, so it answers about half a minute
later.

Run the launcher again after changing a project or package file, Pluperfect.Jwt's client, or `compose.dev.yaml`, such
as an environment variable, because a restart keeps the image and the container as they were made. Docker Desktop
shows the containers under `pluperfect-data-dev`, and stops them.

Your own builds don't reach the containers, and theirs don't reach yours: each `bin` and `obj` is the container's own.
The copy leaves out the `data` folder that running from the code keeps. They take development's ports, so
run the code, the -dev containers, or [Docker](docker.md) one at a time. When a port is taken, the containers don't
start, and the launcher removes the ones that failed, since Docker would otherwise start them later with no network:
running, with nothing answering, and `docker ps` showing `6160/tcp` with no address. Their data is in the volumes
`scry-dev-database`, `scry-dev-data`, `scry-dev-mail`, and `scry-dev-caddy`. Removing them in Docker Desktop starts
the -dev containers over.

## The installer

An instance starts with nothing set. Until it has a database, both addresses, and an admin, every route but
`/install` and `/health` answers 503, and the client sends its visitors to `/install`. The installer asks, in turn:

1. **The database:** a MySQL 8.4 server's host, port, database, user, and password. Scry makes the database if it is
   missing and the user may, applies its migrations, and keeps the settings only once that works. A database Scry
   used before is adopted with its dashboards, sources, and keys.
2. **The addresses:** the client's, where people open Scry and the one origin CORS allows, and the API's, which
   Scry gives Nexus for its push API and its pairing callback. The page fills in its own address and the API
   address it was built with.
3. **Mail:** through Postmark, with its server token and sender, or to Mailpit, which delivers nothing and keeps each
   message for reading on its own page. A test mail goes to an address you name, and mail may stay off. Development
   names a Mailpit at `http://localhost:8025`, so the step starts there.
4. **The first admin:** an email, signed in at once. Once mail works the password is optional, and an admin without
   one signs in with mailed links. With mail off, a password is required. A database that already has an admin skips
   this step, which is how an existing instance is adopted.

Admins change all of it later on the Settings page. A new database is opened and brought up to date before Scry moves
to it. The sources' rows stay in `data/workspaces` whichever database Scry uses.

A page on the machine the API runs on uses the installer as it is. Any other page needs the install code, which the
API writes to its log, with a link to `/install` that carries it, at each start while it is not set up. The code is
sent as `Authorization: Bearer scryi_...`, and five wrong codes lock the installer for 15 minutes. A page counts as
on the machine when it reaches the API over loopback with no proxy's forwarding headers, at a loopback name, from a
page at a loopback name. With [`Scry:Proxied`](configuration.md) set, as behind Caddy, the address the proxy forwards
is the one checked, so a page on any other machine still needs the code.

When a wrong client address keeps the Settings page from reaching the API, `/install` on an instance already set up
changes the addresses. Someone locked out uses its Make an admin, which makes an address an admin with a new password
and signs it out everywhere else. On another machine, either asks the API to write a code to its log, good for an
hour. A database that stops opening at a start sends the instance back to step 1, with the stored settings filled in.

The settings are kept in `data/instance.json`, with the database password, the Postmark token, and the session signing
key encrypted by the Data Protection keys in `data/keys`. The API makes the signing key on its first start. On a box,
`data/` must persist across releases.

A Debug build has one more command, `reset`, which sets `data/instance.json` aside under a dated name, so the next
start opens the installer at its first step. The database, `data/keys`, and `data/workspaces` stay: entering the same
database in the installer adopts it again, and a new name starts empty. It refuses outside Development, and a Release
build has no such command. Stop the API before running it.

```bash
dotnet run --project Server/src/Scry.Api -- reset
```
