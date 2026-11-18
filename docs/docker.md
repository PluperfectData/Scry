# Running Scry in Docker

[Documentation](README.md) › Running Scry in Docker

Scry in three containers, on Windows, macOS, or Linux, instead of the [installer](installing.md)'s programs. Docker
Desktop is a large install, so on Windows the installer is the simpler way in; Docker is for anyone who has it
already.

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
5. Prints the installer's address with its install code while Scry isn't set up, and opens Scry.

The installer page asks for that install code, since requests through Docker don't reach Scry from this computer as
Scry sees it. Then it asks for Mail and the first admin; Scry already knows its database and addresses.

| Address | What |
|---|---|
| `http://localhost:6160` | Scry |
| `http://localhost:6161` | Its API |

These are a development copy's addresses too, so stop one before starting Docker; the launcher says so when a port is
taken. Docker keeps the containers running, and starts them again with Docker. Stop them from Docker Desktop, or with
`docker compose stop` in the Scry folder.

## What runs

`compose.yaml` holds three services, published on this computer only:

| Service | Image | What |
|---|---|---|
| `scry-web` | `ghcr.io/pluperfectdata/scry-web` | Caddy, serving the site |
| `scry-api` | `ghcr.io/pluperfectdata/scry-api` | The API |
| `scry-db` | `mysql:8.4` | The `scry` database, not published outside Docker |

Both of Scry's images come from the one `Dockerfile`, as its `api` and `web` targets. Nexus's connector library,
Pluperfect.Jwt, and Pluperfect.Mail come into the build as its `nexus`, `jwt`, and `mail` build contexts.

The data is in two Docker volumes: `scry-database` holds the database, and `scry-data` what the API keeps (its
settings, keys, each workspace's DuckDB file and uploads, and its logs). ⚠ `docker compose down --volumes` deletes
both, and everything Scry holds with them.

## Running both

Yes to the launcher's question starts `compose.both.yaml`: Scry's and Nexus's compose files together, on one network,
with `compose.linked.yaml` added to Scry's. In it, Scry's server reaches Nexus at `http://nexus-api:6163`, which the
Link Nexus form on a workspace's Settings page starts with, and tells Nexus to push rows to `http://scry-api:6161`.
Link them from that form, as on any other install. Nexus's own launcher can start both the same way.

Each product keeps its own volumes, so its data is the same whether it runs alone or with the other.

## Running a published release

The [Docker workflow](../.github/workflows/docker.yml) builds both images for amd64 and arm64 on every `v` tag and
pushes them to GitHub's container registry, tagged with the version: `v0.2.0` becomes `0.2.0` and `0.2`. To run one
instead of building, once the launcher has made `.env`, set the version and pull, in the Scry folder:

```powershell
$env:SCRY_VERSION = "0.2.0"; docker compose pull scry-api scry-web; docker compose up --detach --no-build
```
