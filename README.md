# Scry

[![API](https://github.com/PluperfectData/Scry/actions/workflows/api.yml/badge.svg)](https://github.com/PluperfectData/Scry/actions/workflows/api.yml)
[![Client](https://github.com/PluperfectData/Scry/actions/workflows/client.yml/badge.svg)](https://github.com/PluperfectData/Scry/actions/workflows/client.yml)

Drag-and-drop dashboards over data synced by [Nexus](https://github.com/PluperfectData/Nexus).

Status: first slice. Upload a CSV file, then chart it on a dashboard page in a drag-and-drop grid, in any of 25
chart types or a table. Light theme by default, with a dark theme from the header.
One built-in workspace, no accounts.

| Path | Contents |
|---|---|
| `Server/src/Scry.Api` | .NET 10 API, MVC controllers |
| `Server/tests/Scry.Api.Tests` | NUnit and Shouldly, against the real API over in-memory SQLite |
| `Client` | React client: Vite, react-router, Apache ECharts, react-grid-layout |

| Part | Choice |
|---|---|
| Application data | MySQL, through EF Core 9 and Pomelo: sources and dashboards |
| Synced data | DuckDB, in process, one file per workspace, written by the Nexus DuckDB destination |
| Charts | Apache ECharts: bar, stacked bar, pictorial bar, line, area, theme river, pie, funnel, scatter, ripple scatter, heatmap, histogram, box plot, parallel coordinates, radar, treemap, sunburst, tree, Sankey, network graph, chord, region map, flow map, gauge, and candlestick. Tables are plain HTML. |
| Maps | World countries from world-atlas and US states from us-atlas, both ISC, from Natural Earth and US Census data. Each is a separate asset, fetched the first time a chart needs it. |
| Layout | react-grid-layout, one layout per breakpoint |
| Theme | Light by default. The header's toggle switches to dark, and the browser remembers the choice. |

Nexus is consumed as a sibling checkout through `ProjectReference`: clone both repositories into the same
parent directory.

## API

| Route | Does |
|---|---|
| `GET /health` | Answers `{"status": "ok"}` |
| `GET /sources` | Lists sources: name, the file or the connection's stream the rows come from, columns and their types, row count, sync time, and `status` (`Ready`, `Syncing`, `Failed`, or `SignInNeeded`) with any `error` |
| `POST /sources` | Form fields `name`, `file`, and optional `delimiter`. Syncs the file through Nexus into a table named `name`. |
| `POST /sources/{id}/sync` | Copies a connection's stream into its source again. An uploaded file answers 400; upload it again instead. A source syncing in the background answers 409. |
| `GET /sources/{id}/uses` | Each chart that reads the source, directly or through a join, as `{dashboardId, dashboardName, chartTitle, chartKind}` |
| `DELETE /sources/{id}` | Removes the source with its table, an upload's stored file, and a connection no other source uses. Charts that read it stay and ask for another source. A source syncing answers 409. A key that can push to a removed source makes it again on its next push. |
| `POST /sources/{id}/sign-in` | For a Schwab source, starts a sign-in that renews its connection's, and answers `{"url"}`: Schwab's sign-in page |
| `GET /schwab/streams` | Lists the streams a Schwab connection offers. Needs no sign-in. |
| `POST /schwab/sign-in` | From `{"settings", "streams": [{"table": "balances", "name": "..."}]}`, checks the names and answers `{"url"}`: Schwab's sign-in page, which returns to the callback |
| `GET /schwab/callback?code=&state=` | Where Schwab sends the browser after its sign-in. Keeps the tokens encrypted, queues each picked stream to copy in the background, and sends the browser to the client's Sources page, with `error` when the sign-in failed. |
| `GET /connectors` | Lists the connectors Scry reads through itself, CSV and then Schwab: id, name, description, and the settings each asks for. Databases and other services come through Nexus. |
| `GET /sources/{id}/series?x=&y=&aggregate=` | `[x, y]`: `y` aggregated per value of `x`, in `x` order, for bar, pictorial bar, line, area, pie, funnel, and region map charts |
| `GET /sources/{id}/links?from=&to=&y=&aggregate=` | `[from, to, y]`: `y` aggregated per pair of ends, both as text, for Sankey, network graph, and chord charts. A row whose ends match is left out. |
| `GET /sources/{id}/values?columns=` | `[value, ...]`: 1 to 12 number columns, repeated, one row per source row with all of them filled in, for parallel coordinates and flow maps |
| `GET /sources/{id}/total?y=&aggregate=` | `["All rows", value]`: `y` aggregated over every row, for a gauge |
| `GET /sources/{id}/measures?columns=&group=&aggregate=` | `[group, value, ...]`: each number column, repeated, aggregated per group, or over every row without `group`, for a radar chart |
| `GET /sources/{id}/tree?levels=&y=&aggregate=` | `[level, ..., value]`: `y` aggregated per path through 1 to 4 levels, repeated, for treemaps, sunbursts, and trees |
| `GET /sources/{id}/groups?x=&group=&y=&aggregate=` | `[x, group, y]`: `y` aggregated per pair, the group as text, for stacked bars, heatmaps, and theme rivers |
| `GET /sources/{id}/pivot?row=&column=&y=&aggregate=` | `[row, column, value, row's place, column's place]`: `y` aggregated per pair, both as text, for a pivot table. The 50 column values largest in the aggregate keep a column each; the rest share one whose value is null, placed last. |
| `GET /sources/{id}/histogram?column=&bins=` | `[start, end, count]` for each of `bins` equal-width bins, 20 by default and 200 at most, empty ones included |
| `GET /sources/{id}/boxes?value=&group=` | `[group, min, first quartile, median, third quartile, max]` per group, or one row named `All rows` without `group` |
| `GET /sources/{id}/points?x=&y=` | `[x, y]`, one per row, for a scatter chart. `x` is a number or a time. |
| `GET /sources/{id}/candles?x=&open=&high=&low=&close=` | `[x, open, close, low, high]`, one per row, in `x` order |
| `GET /sources/{id}/rows?columns=&sort=&direction=&count=&offset=&limit=` | `limit` rows, 1 to 1,000, from `offset`, of the chosen columns, repeated, or every column, as text, with the source's `total` row count. Sorted by `sort` in `direction` (`asc` or `desc`) with blanks last, or in source order without `sort`. With `count=true`, rows matching in every shown column become one, with a last column, Count; it sorts by `sort=__scry_count` or a shown column, and by the count, highest first, without `sort`. |
| `GET`, `POST /dashboards` | Lists each dashboard's name, `chartCount`, and `isLanding`, or creates one from `{"name": "..."}` |
| `GET`, `PUT`, `DELETE /dashboards/{id}` | Reads, replaces `name`, `layouts`, and `widgets`, or deletes |
| `PATCH /dashboards/{id}` | From `{"name": "...", "isLanding": true}`, renames the dashboard and makes it the landing dashboard, clearing any other, or with `false` stops it being one |
| `GET`, `POST /keys` | Lists push API keys, each with the sources it writes, or makes one from `{"name": "..."}` and answers it with `key`, shown this once |
| `DELETE /keys/{id}` | Revokes a key. Its sources stay, and no key writes to them. |
| `GET /nexus` | Scry's link to Nexus, or `{"linked": false}` |
| `POST /nexus/pairing` | From `{"nexusUrl"}`, opens a pairing at that Nexus and answers `{"approveUrl"}`, the page where its admin approves Scry |
| `GET /nexus/callback?pairing=` | Where Nexus sends the admin back. Makes a push key named for that Nexus, such as "Nexus at localhost:6163", claims the pairing with it for Nexus's app key, keeps the link, and sends the browser to Settings, with `error` when linking failed. Scry pairs as "Scry at" its own host. |
| `DELETE /nexus` | Unlinks: Nexus revokes Scry's app key, Scry revokes Nexus's push key, and the link goes. The sources Nexus sent stay. |
| `GET /nexus/connectors` | The connectors Nexus reads through, such as MySQL, which the Sources page offers under Through Nexus. One the link's workspace cannot connect yet, such as Schwab without a sign-in app, says why on its tile and cannot be picked. |
| `POST /nexus/connect` | From `{"connector"}`, opens Nexus's connect page for it, into the link's destination and coming back to the Sources page, and answers `{"url"}`. Nexus adds `connection` to the return address once connected, or `error=cancelled`. |
| `GET /nexus/syncs` | The syncs that fill the link's destination: the connection and stream each reads, its table, and how its last run went |
| `POST /nexus/syncs/{id}/run` | Runs one of those syncs now |
| `GET /install` | Where the instance stands: `installed`, `stage` (`Database`, `Address`, `Admin`, or `Done`), whether the page is `local` and `allowed` to use the installer, whether Scry can send `mail`, and, when it is allowed, the database without its password and both addresses |
| `POST /install/database` | From `{"host", "port", "name", "user", "password"}`, opens the database, makes it when it is missing and the user may, applies the migrations, and keeps it only once that works. Answers 409 once a database is set. |
| `POST /install/addresses` | From `{"clientOrigin", "apiOrigin"}`, keeps the client's address and the API's. On an instance already set up, it changes them. |
| `PUT` and `DELETE /install/mail`, `POST /install/mail/test` | From the Settings page's mail fields, sets mail before the first admin, or turns it off, and mails `{"to"}` to check it. Answers 409 once the instance is set up. |
| `POST /install/admin` | From `{"email", "password"}`, makes the first admin and signs them in, which sets the instance up. The password may be blank once mail works. On an instance already set up, it makes an address an admin, for someone locked out, and ends its other sessions; a blank password leaves theirs. |
| `POST /install/code` | Writes the install code to the API's log, at most once a minute |
| `POST /auth/sign-in`, `POST /auth/link`, `POST /auth/link/redeem` | Signs in with a password, mails a link, or signs in with one |
| `GET /auth/me`, `GET /auth/csrf`, `POST /auth/refresh`, `POST /auth/sign-out`, `PUT /auth/password` | The session and the signed-in user's password |
| `/users` | Admins invite, change, and remove users. An invite that is not mailed answers its link. |
| `GET /settings` | For admins: both addresses, the mail, and the database without its password, each with whether configuration sets it. The server token is never answered. |
| `PUT /settings/addresses` | From `{"clientOrigin", "apiOrigin"}`, changes the addresses |
| `PUT` and `DELETE /settings/mail`, `POST /settings/mail/test` | From `{"serverToken", "from", "fromName"}`, sets Postmark's token and the sender, or turns mail off, and mails the admin to check it. A blank token keeps the stored one. |
| `PUT /settings/database` | From the installer's fields, moves Scry to another database once it opens and is up to date. A blank password keeps the stored one for the same server, database, and user. |
| `GET /ingest` | Push API: names the key the request carries, by its name and prefix |
| `PUT /ingest/sources/{name}` | Push API: makes a source from `{"columns": [{"name", "type"}], "primaryKey": [...], "origin"}`, or adds columns to one. `origin`, optional, says where the rows come from, up to 500 characters, and the Sources page shows it. |
| `POST /ingest/sources/{name}/batches` | Push API: from `{"id", "mode", "rows": [[...]]}`, appends the rows or merges them by the key, in one transaction; a batch id already written is skipped |
| `POST /ingest/sources/{name}/replace` | Push API: starts a replacement, with new columns or the source's own, and an `origin` as `PUT` takes; batches go to it until a commit |
| `POST /ingest/sources/{name}/commit` | Push API: swaps a replacement in, and answers the source with its row count |

The Nexus routes answer 409 while Scry is unlinked, and 502 with Nexus's own words when Nexus refuses. A source pushed with
the link's push key is listed with `kind` `Nexus`.

- A source name starts with a lowercase letter and holds lowercase letters, digits, and underscores, 63 at most.
  A taken name answers 409. The file can be up to 1 GB.
- `aggregate` is `sum`, `avg`, `min`, `max`, or `count`. `y` must be a number column, and is left out for
  `count`. Open, high, low, and close must be number columns too.
- Series, points, and candles carry `xType`: `value` for a number column, `time` for a date or time column, sent
  as epoch milliseconds in UTC, and `category` for anything else. JSON and binary columns cannot be an x axis.
  They return at most 10,000 points, with `truncated` set when there were more.
- Every chart route also takes a join: `join` (another source's id), `joinOn` (a column of this source), `joinTo` (a
  column of the other), and `joinKind`, which keeps unmatched rows from neither source (`inner`), this one
  (`left`), the other (`right`), or both (`full`). Joined, columns are named for their source, as `orders.amount`,
  and source order is this source's, then the other's.
- Errors are problem details, with a `detail` safe to show.
- Every route needs a signed-in user but `/health`, the installer, the sign-in routes under `/auth`, the push API, and
  Schwab's callback, which carries its own `state`.
- The push API's routes take a key as `Authorization: Bearer <key>`, and no session. A key writes only to the sources it made.
  A pushed source whose key was revoked becomes the next key's to write to it.
  The client's `/docs/push-api` page is the reference for people using it: column types, modes, limits, and answers.
- The API applies its EF migrations each time it opens a database: at a start, and when the installer or the
  Settings page sets one.

## Run it

Start the API and the client, then open `http://localhost:6160/install`.

```bash
dotnet run --project Server/src/Scry.Api
```

```bash
npm --prefix Client install
```

```bash
npm --prefix Client run dev
```

The API listens on `http://localhost:6161`, and on `https://127.0.0.1:6162` for Schwab's callback, with the .NET
development certificate. The client listens on `http://localhost:6160` and reads the API's address from
`VITE_API_URL`, set in `Client/.env.development`.

### The installer

An instance starts with nothing set. Until it has a database, both addresses, and an admin, every route but
`/install` and `/health` answers 503, and the client sends its visitors to `/install`. The installer asks, in turn:

1. **The database:** a MySQL 8.4 server's host, port, database, user, and password. Scry makes the database if it is
   missing and the user may, applies its migrations, and keeps the settings only once that works. A database Scry
   used before is adopted with its dashboards, sources, and keys.
2. **The addresses:** the client's, where people open Scry and the one origin CORS allows, and the API's, which
   Scry gives Nexus for its push API and its pairing callback. The page fills in its own address and the API
   address it was built with.
3. **Mail:** Postmark's server token and the sender, with a test mail to an address you name. Mail may stay off.
   A Debug build running as Development writes mail to `data/mail`, and the step says so.
4. **The first admin:** an email, signed in at once. Once mail works the password is optional, and an admin without
   one signs in with mailed links. With mail off, a password is required. A database that already has an admin skips
   this step, which is how an existing instance is adopted.

Admins change all of it later on the Settings page. A new database is opened and brought up to date before Scry moves
to it. The sources' rows stay in `data/workspaces` whichever database Scry uses.

### Users and sign-in

There is no sign-up. An admin invites each user from the Users page, in the account menu, and changes the instance's
settings. Every user changes the dashboards, sources, keys, and the Nexus link.

- A user signs in with a password, or with a link mailed to them that works once, for 15 minutes. An invite link works
  once, for 7 days. Mail goes through `Pluperfect.Mail`'s Postmark transport, with the token set on the Settings page.
  A Debug build running as Development writes `.eml` files to `data/mail` instead, until a Postmark token and sender
  are saved to test real mail; turning Postmark off returns it to the files. A released Scry never writes mail to
  files. An instance without mail offers no mailed links, and an invite answers its link for the admin to pass on.
- The session is `Pluperfect.Jwt`'s: an access token in an `HttpOnly` cookie, a refresh token that rotates, and the
  origin and antiforgery checks on every unsafe request. Scry's cookies are named `scry_sid` and `scry_rt`, so a
  Nexus on the same host keeps its own session.
- Five wrong passwords for one address lock it for 15 minutes, and one address gets at most three mailed links in that
  time.
- Setting a password ends the user's other sessions. A forgotten password is replaced by signing in with a mailed link
  and setting a new one.

A page on the machine the API runs on uses the installer as it is. Any other page needs the install code, which the
API writes to its log, with a link to `/install` that carries it, at each start while it is not set up. The code is
sent as `Authorization: Bearer scryi_...`, and five wrong codes lock the installer for 15 minutes. A page counts as
on the machine when it reaches the API over loopback with no proxy's forwarding headers, at a loopback name, from a
page at a loopback name; a box behind Caddy's Unix socket always needs the code.

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

### Configuration

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
| `Scry:DataDirectory` | `data`, beside the API. Uploads, `workspaces/default/data.duckdb`, `instance.json`, and `keys`, the keys that encrypt stored connections and the database password, live here. |
| `Schwab:AppKey`, `Schwab:AppSecret` | The key and secret of your Schwab app. Without both, the Schwab form says to set them. |
| `Schwab:CallbackUrl` | `https://127.0.0.1:6162/schwab/callback`, which must match the app's callback on Schwab's developer portal exactly |

To add Schwab sources, set the app's key and secret, and register `https://127.0.0.1:6162/schwab/callback` as the
app's callback on Schwab's developer portal:

```bash
dotnet user-secrets set Schwab:AppKey "<app key>" --project Server/src/Scry.Api
```

```bash
dotnet user-secrets set Schwab:AppSecret "<app secret>" --project Server/src/Scry.Api
```

## Build

.NET SDK 10.0.302 or a later feature band (`Server/global.json`), and Node 24.

```bash
dotnet test Server/Scry.slnx
```

```bash
npm --prefix Client test
```

Restores are locked to `packages.lock.json`. After a dependency change, run `dotnet restore --force-evaluate`
and commit the lock files.

## License

AGPL-3.0-only. See `LICENSE`.
