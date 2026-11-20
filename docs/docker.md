# Running Scry in Docker

[Documentation](README.md) › Running Scry in Docker

Scry in three containers, on Windows, macOS, or Linux, instead of the [installer](installing.md)'s programs. Docker
Desktop is a large install, so on Windows the installer is the simpler way in; Docker is for anyone who has it
already. For working on the code in Docker, see
[In Docker, with the -dev containers](running.md#in-docker-with-the--dev-containers).

## Starting it

Put the code at `Pluperfect.Data/Scry`, as the README's [quick start](../README.md#quick-start) says. Start Docker
Desktop, or Docker on Linux, and wait until it is running. Then, in the Scry folder:

| On | Run |
|---|---|
| Windows | Double-click `Scry Docker.cmd` |
| macOS or Linux | `sh scry-docker.sh` |

The launcher:

1. Fetches Nexus beside Scry, since Scry builds on its connector library, and Pluperfect.Jwt and Pluperfect.Mail
   beside `Pluperfect.Data`, with Git, when they aren't there.
2. Asks whether to start Nexus too. See [Running both](#running-both).
3. Makes the database's password the first time, in `.env` beside `compose.yaml`, which git ignores.
4. Builds the images from the folder and starts them. The first build takes several minutes.
5. Asks the computer to trust Scry's certificates, the first time. See [Certificates](#certificates).
6. Prints the installer's address with its install code while Scry isn't set up, and opens Scry.

The installer page asks for that install code, since requests through Docker don't reach Scry from this computer as
Scry sees it. Then it asks for Mail and the first admin; Scry already knows its database and addresses. Mail starts at Mailpit,
so the first admin may skip the password.

| Address | What |
|---|---|
| `https://localhost:6160` | Scry |
| `https://localhost:6161` | Its API |
| `http://localhost:6162` | Mailpit, where Scry's mail waits to be read |

Docker Desktop's links to these ports open them at `http://127.0.0.1`, and Caddy sends each one on to its
`https://localhost` address, where Scry's cookies and its API's allowed origin apply.

A development copy uses the same ports, so stop one before starting Docker; the launcher says so when a port is
taken. Docker keeps the containers running, and starts them again with Docker. Stop them from Docker Desktop, or with
`docker compose stop` in the Scry folder.

## Certificates

Caddy, in the `scry-web` container, serves both addresses over HTTPS, with certificates from an authority it makes
itself and keeps in the `scry-caddy` volume. The launcher adds that authority to the ones the computer trusts, the
first time it meets it:

| On | What happens |
|---|---|
| Windows | Windows asks whether to trust it. Choose **Yes**. It goes in your account's trusted roots. |
| macOS | macOS asks for your password, and it goes in your login keychain. |
| Linux | `sudo` asks for your password, and it goes in the system's trusted certificates. Chrome's own store gets it too, when `certutil` is installed. |

⚠ Firefox on Linux keeps its own list. Import `root.crt` from the `scry-web` container in its certificate settings,
or it warns at each address.

Declining leaves the browser warning at each address, and Scry's site can't reach the API until you open
`https://localhost:6161` once and continue past the warning. Deleting the `scry-caddy` volume makes a new authority,
which the launcher asks about on its next run. With Nexus running too, its `nexus-web` container has an authority of
its own, and the launcher asks about both.

## What runs

`compose.yaml` holds four services, published on this computer only:

| Service | Image | What |
|---|---|---|
| `scry-web` | `ghcr.io/pluperfectdata/scry-web` | Caddy, serving the site and the API over HTTPS |
| `scry-api` | `ghcr.io/pluperfectdata/scry-api` | The API, which browsers reach only through `scry-web` |
| `scry-db` | `mysql:8.4` | The `scry` database, not published outside Docker |
| `scry-mail` | `axllent/mailpit:v1.33` | Mailpit, which keeps the mail the API sends until Postmark is set up, at `http://localhost:6162` |

Both of Scry's images come from the one `Dockerfile`, as its `api` and `web` targets. Nexus's connector library,
Pluperfect.Jwt, and Pluperfect.Mail come into the build as its `nexus`, `jwt`, and `mail` build contexts.

The data is in four Docker volumes: `scry-database` holds the database, `scry-data` what the API keeps (its
settings, keys, each workspace's DuckDB file and uploads, and its logs), `scry-caddy` Caddy's authority and
certificates, and `scry-mail` the mail Mailpit keeps. ⚠ `docker compose down --volumes` deletes all four, and
everything Scry holds with them.

Since every browser request reaches the API through Caddy, `compose.yaml` sets `Scry__Proxied`, and the API reads who
asked and over what from Caddy's forwarding headers. See [configuration](configuration.md).

## Running both

Yes to the launcher's question starts `compose.both.yaml`: Scry's and Nexus's compose files together, on one network,
with `compose.linked.yaml` added to Scry's. In it, Scry's server reaches Nexus at `http://nexus-api:6163`, which the
Link Nexus form on a workspace's Settings page starts with, and tells Nexus to push rows to `http://scry-api:6161`.
Those two addresses stay inside Docker's network, so they are plain HTTP. Link them from that form, as on any other
install. Nexus's own launcher can start both the same way.

Each product keeps its own volumes, so its data is the same whether it runs alone or with the other.

## Running a published release

The [Docker workflow](../.github/workflows/docker.yml) builds both images for amd64 and arm64 on every `v` tag and
pushes them to GitHub's container registry, tagged with the version: `v0.2.0` becomes `0.2.0` and `0.2`. To run one
instead of building, once the launcher has made `.env`, set the version and pull, in the Scry folder:

```powershell
$env:SCRY_VERSION = "0.2.0"; docker compose pull scry-api scry-web; docker compose up --detach --no-build
```
