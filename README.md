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
| `POST /sources/{id}/sign-in` | For a Schwab source, starts a sign-in that renews its connection's, and answers `{"url"}`: Schwab's sign-in page |
| `GET /schwab/streams` | Lists the streams a Schwab connection offers. Needs no sign-in. |
| `POST /schwab/sign-in` | From `{"settings", "streams": [{"table": "balances", "name": "..."}]}`, checks the names and answers `{"url"}`: Schwab's sign-in page, which returns to the callback |
| `GET /schwab/callback?code=&state=` | Where Schwab sends the browser after its sign-in. Keeps the tokens encrypted, queues each picked stream to copy in the background, and sends the browser to the client's Sources page, with `error` when the sign-in failed. |
| `GET /connectors` | Lists the connectors a source can come from, CSV first and then each database: id, name, description, and the settings its Nexus connector asks for |
| `POST /databases/tables` | From `{"connector": "...", "settings": {...}}`, connects and lists the database's tables. Nothing is kept. A failed connection answers 400 with the reason. |
| `POST /databases` | From `{"connector", "settings", "tables": [{"table": "...", "name": "..."}]}`, keeps the connection with its settings encrypted and syncs each table into a source named `name`. A failure saves no source and no connection. |
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
| `GET /ingest` | Push API: names the key the request carries, by its name and prefix |
| `PUT /ingest/sources/{name}` | Push API: makes a source from `{"columns": [{"name", "type"}], "primaryKey": [...]}`, or adds columns to one |
| `POST /ingest/sources/{name}/batches` | Push API: from `{"id", "mode", "rows": [[...]]}`, appends the rows or merges them by the key, in one transaction; a batch id already written is skipped |
| `POST /ingest/sources/{name}/replace` | Push API: starts a replacement, with new columns or the source's own; batches go to it until a commit |
| `POST /ingest/sources/{name}/commit` | Push API: swaps a replacement in, and answers the source with its row count |

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
- The push API's routes take a key as `Authorization: Bearer <key>`, and a key writes only to the sources it made.
  The client's `/docs/push-api` page is the reference for people using it: column types, modes, limits, and answers.
- The API applies its EF migrations at startup.

| Setting | Default |
|---|---|
| `ConnectionStrings:Scry` | Required: a MySQL connection string |
| `Scry:DataDirectory` | `data`, beside the API. Uploads, `workspaces/default/data.duckdb`, and `keys`, the keys that encrypt stored connections, live here. |
| `Scry:ClientOrigin` | `http://localhost:6160`, the one origin CORS allows, and where the Schwab callback sends the browser |
| `Schwab:AppKey`, `Schwab:AppSecret` | The key and secret of your Schwab app. Without both, the Schwab form says to set them. |
| `Schwab:CallbackUrl` | `https://127.0.0.1:6162/schwab/callback`, which must match the app's callback on Schwab's developer portal exactly |

## Run it

```bash
dotnet user-secrets set ConnectionStrings:Scry "Server=localhost;Database=scry;User ID=...;Password=..." --project Server/src/Scry.Api
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

The API listens on `http://localhost:6161`, and on `https://127.0.0.1:6162` for Schwab's callback, with the .NET
development certificate. The client listens on `http://localhost:6160` and reads the API's address from
`VITE_API_URL`, set in `Client/.env.development`.

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
