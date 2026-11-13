# Scry

[![API](https://github.com/PluperfectData/Scry/actions/workflows/api.yml/badge.svg)](https://github.com/PluperfectData/Scry/actions/workflows/api.yml)
[![Client](https://github.com/PluperfectData/Scry/actions/workflows/client.yml/badge.svg)](https://github.com/PluperfectData/Scry/actions/workflows/client.yml)

Drag-and-drop dashboards over data synced by [Nexus](https://github.com/PluperfectData/Nexus).

Status: first slice. Upload a CSV file, then chart it on a dashboard page in a drag-and-drop grid, as a bar,
line, pie, scatter, or candlestick chart, or a table. Light theme by default, with a dark theme from the header.
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
| Charts | Apache ECharts: bar, line, pie, scatter, and candlestick. Tables are plain HTML. |
| Layout | react-grid-layout, one layout per breakpoint |
| Theme | Light by default. The header's toggle switches to dark, and the browser remembers the choice. |

Nexus is consumed as a sibling checkout through `ProjectReference`: clone both repositories into the same
parent directory.

## API

| Route | Does |
|---|---|
| `GET /health` | Answers `{"status": "ok"}` |
| `GET /sources` | Lists sources: name, file, columns and their types, row count, sync time |
| `POST /sources` | Form fields `name`, `file`, and optional `delimiter`. Syncs the file through Nexus into a table named `name`. |
| `GET /sources/{id}/series?x=&y=&aggregate=` | `[x, y]`: `y` aggregated per value of `x`, in `x` order, for bar, line, and pie charts |
| `GET /sources/{id}/points?x=&y=` | `[x, y]`, one per row, for a scatter chart. `x` is a number or a time. |
| `GET /sources/{id}/candles?x=&open=&high=&low=&close=` | `[x, open, close, low, high]`, one per row, in `x` order |
| `GET /sources/{id}/rows?columns=` | The chosen columns, repeated, or every column, as text, in source order: at most 1,000 rows |
| `GET`, `POST /dashboards` | Lists, or creates from `{"name": "..."}` |
| `GET`, `PUT`, `DELETE /dashboards/{id}` | Reads, replaces `name`, `layouts`, and `widgets`, or deletes |

- A source name starts with a lowercase letter and holds lowercase letters, digits, and underscores, 63 at most.
  A taken name answers 409.
- `aggregate` is `sum`, `avg`, `min`, `max`, or `count`. `y` must be a number column, and is left out for
  `count`. Open, high, low, and close must be number columns too.
- Series, points, and candles carry `xType`: `value` for a number column, `time` for a date or time column, sent
  as epoch milliseconds in UTC, and `category` for anything else. JSON and binary columns cannot be an x axis.
  They return at most 10,000 points, with `truncated` set when there were more.
- Errors are problem details, with a `detail` safe to show.
- The API applies its EF migrations at startup.

| Setting | Default |
|---|---|
| `ConnectionStrings:Scry` | Required: a MySQL connection string |
| `Scry:DataDirectory` | `data`, beside the API. Uploads and `workspaces/default/data.duckdb` live here. |
| `Scry:ClientOrigin` | `http://localhost:5173`, the one origin CORS allows |

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

The API listens on `http://localhost:8080` and the client on `http://localhost:5173`. The client reads the
API's address from `VITE_API_URL`, set in `Client/.env.development`.

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
