# How Scry is built

[Documentation](README.md) › How Scry is built

## The repository

| Path | Contents |
|---|---|
| `Server/src/Scry.Api` | .NET 10 API, MVC controllers |
| `Server/tests/Scry.Api.Tests` | NUnit and Shouldly, against the real API over in-memory SQLite |
| `Client` | React client: Vite, react-router, Apache ECharts, react-grid-layout |
| `install.ps1`, `start.ts` | The Windows installer, and the script its desktop shortcut runs: [Installing on Windows](installing.md) |
| `Dockerfile`, `compose.yaml`, `compose.both.yaml`, `compose.linked.yaml`, `deploy/docker` | The Docker images and their services: [Running Scry in Docker](docker.md) |
| `Scry Docker.cmd`, `scry-docker.sh` | The Docker launchers, for Windows, and for macOS and Linux |

## The parts

| Part | Choice |
|---|---|
| Application data | MySQL, through EF Core 9 and Pomelo: users, workspaces, sources, and dashboards |
| Synced data | DuckDB, in process, one file per workspace, written by the Nexus DuckDB destination |
| Charts | Apache ECharts: bar, stacked bar, pictorial bar, line, area, theme river, pie, funnel, scatter, ripple scatter, heatmap, histogram, box plot, parallel coordinates, radar, treemap, sunburst, tree, Sankey, network graph, chord, region map, flow map, gauge, and candlestick. Tables are plain HTML. |
| Maps | World countries from world-atlas and US states from us-atlas, both ISC, from Natural Earth and US Census data. Each is a separate asset, fetched the first time a chart needs it. |
| Layout | react-grid-layout, one layout per breakpoint |
| Theme | Light by default. The header's toggle switches to dark, and the browser remembers the choice. |

## Sibling checkouts

Scry builds against three other repositories, which it takes by relative path, so each must sit where Scry expects:

```text
any-folder/
├── Pluperfect.Data/
│   ├── Nexus/         github.com/PluperfectData/Nexus: the connectors Scry reads files and writes DuckDB through
│   └── Scry/          this repository
├── Pluperfect.Jwt/    github.com/mnwachukwu/Pluperfect.Jwt: sessions
└── Pluperfect.Mail/   github.com/mnwachukwu/Pluperfect.Mail: mail
```
