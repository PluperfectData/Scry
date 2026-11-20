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

Instead of installing .NET, MySQL, and Mailpit, the code can run in containers that reload as it does from the code.
With Docker running, double-click `Scry Dev.cmd` on Windows, or run `sh scry-dev.sh` on macOS or Linux. The launcher:

1. Fetches Nexus, Pluperfect.Jwt, and Pluperfect.Mail beside Scry with Git, when they aren't there. Scry's API builds
   with Nexus's connector library.
2. Asks whether to start Nexus's -dev containers too, linked to Scry.
3. Makes the database's password the first time, in `.env.dev` beside `compose.dev.yaml`, which git ignores.
4. Builds the images from `Dockerfile.dev` and starts the containers. The first build takes several minutes.
5. With Nexus, asks the computer to trust the authority behind Nexus's callback address, the first time.
6. Opens `http://localhost:6160`, then watches the folders.

| Container | What |
|---|---|
| `scry-api-dev` | The API, under `dotnet watch`, in Development, at `http://localhost:6161` |
| `scry-web-dev` | The site, under Vite's dev server, at `http://localhost:6160` |
| `scry-db-dev` | MySQL, at 127.0.0.1, port 6166, for MySQL Workbench or the `mysql` client, as `scry`, with the `SCRY_DEV_DB_PASSWORD` in `.env.dev` |
| `scry-mail-dev` | Mailpit, at `http://localhost:6162` |

With Nexus's beside them, Scry's link form starts with `http://nexus-api-dev:6163`, and Scry tells Nexus to push rows
to `http://scry-api-dev:6161`, as in [Running both](docker.md#running-both).

A file saved under `Server/src`, `Client/src`, or `Client/public`, under Nexus's connector library, or under
Pluperfect.Jwt's or Pluperfect.Mail's `src`, is copied into its container: the API takes the change, restarting when
it must, and the page reloads. A change to `package.json`, `package-lock.json`, `Directory.Packages.props`, or
Pluperfect.Jwt's client rebuilds its image. The window shows the containers' lines, including the installer's address
with its install code on a new database, since requests reach the API through Docker. **Ctrl+C** stops them.

Your own builds don't reach the containers; they build their own. They take development's ports, so run the code, the
-dev containers, or [Docker](docker.md) one at a time. Their data is in the volumes `scry-dev-database`,
`scry-dev-data`, and `scry-dev-mail`. Removing them in Docker Desktop starts the -dev containers over.

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
