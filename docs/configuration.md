# Configuration

[Documentation](README.md) › Configuration

Every setting the installer and the Settings page take can be set in configuration instead, for an operator or for
debugging. A configured value wins over the stored one, and the pages show it without offering to change it.

| Setting | Environment variable | Takes the place of |
|---|---|---|
| `ConnectionStrings:Scry` | `ConnectionStrings__Scry` | The database |
| `Scry:ClientOrigin` | `Scry__ClientOrigin` | The client's address |
| `Scry:ApiOrigin` | `Scry__ApiOrigin` | The API's address |
| `Mail:ServerToken` | `Mail__ServerToken` | Postmark's server token |
| `Scry:MailFrom`, `Scry:MailFromName` | `Scry__MailFrom`, `Scry__MailFromName` | The sender |
| `Jwt:SigningKey` | `Jwt__SigningKey` | The session signing key the API makes, at least 32 bytes |
| `Scry:LogDays` | `Scry__LogDays` | How many days the Log page keeps an entry |
| `Mail:PickupDirectory` | `Mail__PickupDirectory` | Sending mail, in a Debug build running as Development: it is written to files there until a Postmark token and sender are saved. Anywhere else it is ignored, and the log says so. |

For example, as a user secret:

```bash
dotnet user-secrets set ConnectionStrings:Scry "Server=localhost;Database=scry;User ID=...;Password=..." --project Server/src/Scry.Api
```

`add-admin` makes or restores an admin, prints a link that signs them in once, within an hour, and exits.

```bash
dotnet run --project Server/src/Scry.Api -- add-admin you@example.com
```

These settings have no page:

| Setting | Default |
|---|---|
| `Scry:DataDirectory` | `data`, beside the API. Each workspace's DuckDB file and uploads, under `workspaces`, `instance.json`, and `keys`, the keys that encrypt the Nexus links' app keys and the database password, live here. |
| `Scry:NexusUrl` | None. The Nexus address the Link Nexus form starts with, where Scry's server reaches Nexus at another address than a browser does. Docker's `compose.linked.yaml` sets `http://nexus-api:6163`. |
| `Scry:IngestOrigin` | `Scry:ApiOrigin`. The address Scry gives Nexus to push rows to, where Nexus reaches the API at another address than a browser does. Docker's `compose.linked.yaml` sets `http://scry-api:6161`. |
| `Scry:Proxied` | `false`. Whether browsers reach the API only through a proxy, such as Caddy. When `true`, the API believes the proxy's `X-Forwarded-For` and `X-Forwarded-Proto`: who asked, for the install code's check, and whether it came over HTTPS, which the session and antiforgery cookies need outside Development. Docker's `compose.yaml` sets it. |

⚠ Set `Scry:Proxied` only where the API's own port can't be reached except through the proxy. Anyone who reaches it
directly could otherwise claim any address, including this machine's.
