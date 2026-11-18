# The API

[Documentation](README.md) › The API

| Route | Does |
|---|---|
| `GET /health` | Answers `{"status": "ok"}` |
| `GET /workspaces` | The workspaces the user is in, each with `role`, `Editor` or `Viewer`. An admin gets every one, as an editor. |
| `GET /workspaces/{id}` | One of them, with its `members` and their roles for an admin, and `null` for anyone else |
| `POST /workspaces`, `PATCH /workspaces/{id}` | For admins: makes a workspace from `{"name"}`, or renames one |
| `DELETE /workspaces/{id}` | For admins: from `{"name"}`, which must be the workspace's name, removes the workspace with its dashboards, sources, push keys, and Nexus link, and deletes its folder. Nexus is asked to revoke the link's app key. A source syncing in it answers 409. |
| `PUT`, `DELETE /workspaces/{id}/members/{userId}` | For admins: from `{"role"}`, adds a user to the workspace or changes their role, or takes them out |
| `GET /workspaces/{workspaceId}/sources` | Lists sources: name, the file or the connection's stream the rows come from, columns and their types, row count, sync time, and `status` (`Ready`, `Syncing`, `Failed`, or `SignInNeeded`) with any `error`. A source Nexus fills carries its connection's `signIn`: the `provider`, its `kind`, `signedInAt`, `endsAt`, `endingSoon`, `ended`, `endedAt`, and the labels of its `accounts`, as Nexus last said within the minute. Without an answer from Nexus within 5 seconds, it is null. |
| `POST /workspaces/{workspaceId}/sources` | Form fields `name`, `file`, and optional `delimiter`. Syncs the file through Nexus into a table named `name`. |
| `POST /workspaces/{workspaceId}/sources/{id}/sync` | Copies a connection's stream into its source again. An uploaded file answers 400; upload it again instead. A source syncing in the background answers 409. |
| `GET /workspaces/{workspaceId}/sources/{id}/uses` | Each chart that reads the source, directly or through a join, as `{dashboardId, dashboardName, chartTitle, chartKind}` |
| `DELETE /workspaces/{workspaceId}/sources/{id}` | Removes the source with its table, an upload's stored file, and a connection no other source uses. Charts that read it stay and ask for another source. A source syncing answers 409. A key that can push to a removed source makes it again on its next push. |
| `POST /workspaces/{workspaceId}/sources/{id}/sign-in` | For a Schwab source, starts a sign-in that renews its connection's, and answers `{"url"}`: Schwab's sign-in page |
| `GET /workspaces/{workspaceId}/schwab/streams` | Lists the streams a Schwab connection offers. Needs no sign-in. |
| `POST /workspaces/{workspaceId}/schwab/sign-in` | From `{"settings", "streams": [{"table": "balances", "name": "..."}]}`, checks the names and answers `{"url"}`: Schwab's sign-in page, which returns to the callback |
| `GET /schwab/callback?code=&state=` | Where Schwab sends the browser after its sign-in. Keeps the tokens encrypted, queues each picked stream to copy in the background, and sends the browser to the workspace's Sources page, with `error` when the sign-in failed. A sign-in Scry does not know goes back to the client's `/`, with its `error`. |
| `GET /workspaces/{workspaceId}/connectors` | Lists the connectors Scry reads through itself, CSV and then Schwab: id, name, description, and the settings each asks for. Databases and other services come through Nexus. |
| `GET /workspaces/{workspaceId}/sources/{id}/series?x=&y=&aggregate=` | `[x, y]`: `y` aggregated per value of `x`, in `x` order, for bar, pictorial bar, line, area, pie, funnel, and region map charts |
| `GET /workspaces/{workspaceId}/sources/{id}/links?from=&to=&y=&aggregate=` | `[from, to, y]`: `y` aggregated per pair of ends, both as text, for Sankey, network graph, and chord charts. A row whose ends match is left out. |
| `GET /workspaces/{workspaceId}/sources/{id}/values?columns=` | `[value, ...]`: 1 to 12 number columns, repeated, one row per source row with all of them filled in, for parallel coordinates and flow maps |
| `GET /workspaces/{workspaceId}/sources/{id}/total?y=&aggregate=` | `["All rows", value]`: `y` aggregated over every row, for a gauge |
| `GET /workspaces/{workspaceId}/sources/{id}/measures?columns=&group=&aggregate=` | `[group, value, ...]`: each number column, repeated, aggregated per group, or over every row without `group`, for a radar chart |
| `GET /workspaces/{workspaceId}/sources/{id}/tree?levels=&y=&aggregate=` | `[level, ..., value]`: `y` aggregated per path through 1 to 4 levels, repeated, for treemaps, sunbursts, and trees |
| `GET /workspaces/{workspaceId}/sources/{id}/groups?x=&group=&y=&aggregate=` | `[x, group, y]`: `y` aggregated per pair, the group as text, for stacked bars, heatmaps, and theme rivers |
| `GET /workspaces/{workspaceId}/sources/{id}/pivot?row=&column=&y=&aggregate=` | `[row, column, value, row's place, column's place]`: `y` aggregated per pair, both as text, for a pivot table. The 50 column values largest in the aggregate keep a column each; the rest share one whose value is null, placed last. |
| `GET /workspaces/{workspaceId}/sources/{id}/histogram?column=&bins=` | `[start, end, count]` for each of `bins` equal-width bins, 20 by default and 200 at most, empty ones included |
| `GET /workspaces/{workspaceId}/sources/{id}/boxes?value=&group=` | `[group, min, first quartile, median, third quartile, max]` per group, or one row named `All rows` without `group` |
| `GET /workspaces/{workspaceId}/sources/{id}/points?x=&y=` | `[x, y]`, one per row, for a scatter chart. `x` is a number or a time. |
| `GET /workspaces/{workspaceId}/sources/{id}/candles?x=&open=&high=&low=&close=` | `[x, open, close, low, high]`, one per row, in `x` order |
| `GET /workspaces/{workspaceId}/sources/{id}/rows?columns=&sort=&direction=&count=&offset=&limit=` | `limit` rows, 1 to 1,000, from `offset`, of the chosen columns, repeated, or every column, as text, with the source's `total` row count. Sorted by `sort` in `direction` (`asc` or `desc`) with blanks last, or in source order without `sort`. With `count=true`, rows matching in every shown column become one, with a last column, Count; it sorts by `sort=__scry_count` or a shown column, and by the count, highest first, without `sort`. |
| `GET`, `POST /workspaces/{workspaceId}/dashboards` | Lists each dashboard's name, `chartCount`, and `isLanding`, or creates one from `{"name": "..."}` |
| `GET`, `PUT`, `DELETE /workspaces/{workspaceId}/dashboards/{id}` | Reads, replaces `name`, `layouts`, and `widgets`, or deletes |
| `PATCH /workspaces/{workspaceId}/dashboards/{id}` | From `{"name": "...", "isLanding": true}`, renames the dashboard and makes it the landing dashboard, clearing any other, or with `false` stops it being one |
| `GET`, `POST /workspaces/{workspaceId}/keys` | Lists push API keys, each with the sources it writes, or makes one from `{"name": "..."}` and answers it with `key`, shown this once |
| `DELETE /workspaces/{workspaceId}/keys/{id}` | Revokes a key. Its sources stay, and no key writes to them. |
| `GET /workspaces/{workspaceId}/nexus` | Scry's link to Nexus, or `{"linked": false}` |
| `POST /workspaces/{workspaceId}/nexus/pairing` | From `{"nexusUrl"}`, opens a pairing at that Nexus and answers `{"approveUrl"}`, the page where its admin approves Scry |
| `GET /workspaces/{workspaceId}/nexus/callback?pairing=` | Where Nexus sends the admin back. Makes a push key named for that Nexus, such as "Nexus at localhost:6163", claims the pairing with it for Nexus's app key, keeps the link, and sends the browser to the workspace's Settings page, with `error` when linking failed. Scry pairs as "Scry at" its own host and the workspace's name, such as "Scry at localhost:6161, workspace Default". |
| `DELETE /workspaces/{workspaceId}/nexus` | Unlinks: Nexus revokes Scry's app key, Scry revokes Nexus's push key, and the link goes. The sources Nexus sent stay. |
| `GET /workspaces/{workspaceId}/nexus/connectors` | The connectors Nexus reads through, such as MySQL, which the Sources page offers under Through Nexus. One the link's workspace cannot connect yet, such as Schwab without a sign-in app, says why on its tile and cannot be picked. |
| `POST /workspaces/{workspaceId}/nexus/connect` | From `{"connector"}`, opens Nexus's connect page for it, into the link's destination and coming back to the Sources page, and answers `{"url"}`. Nexus adds `connection` to the return address once connected, or `error=cancelled`. |
| `GET /workspaces/{workspaceId}/nexus/syncs` | The syncs that fill the link's destination: the connection and stream each reads, its table, how its last run went, and its connection's `signIn` |
| `POST /workspaces/{workspaceId}/nexus/syncs/{id}/run` | Runs one of those syncs now |
| `POST /workspaces/{workspaceId}/nexus/connections/{id}/sign-in` | Opens Nexus's connect page to sign that connection in again, coming back to the Sources page, and answers `{"url"}` |
| `GET /install` | Where the instance stands: `installed`, `stage` (`Database`, `Address`, `Admin`, or `Done`), whether the page is `local` and `allowed` to use the installer, whether Scry can send `mail`, and, when it is allowed, the database without its password and both addresses |
| `POST /install/database` | From `{"host", "port", "name", "user", "password"}`, opens the database, makes it when it is missing and the user may, applies the migrations, and keeps it only once that works. Answers 409 once a database is set. |
| `POST /install/addresses` | From `{"clientOrigin", "apiOrigin"}`, keeps the client's address and the API's. On an instance already set up, it changes them. |
| `PUT` and `DELETE /install/mail`, `POST /install/mail/test` | From the Settings page's mail fields, sets mail before the first admin, or turns it off, and mails `{"to"}` to check it. Answers 409 once the instance is set up. |
| `POST /install/admin` | From `{"email", "password"}`, makes the first admin and signs them in, which sets the instance up. The password may be blank once mail works. On an instance already set up, it makes an address an admin, for someone locked out, and ends its other sessions; a blank password leaves theirs. |
| `POST /install/code` | Writes the install code to the API's log, at most once a minute |
| `POST /auth/sign-in`, `POST /auth/link`, `POST /auth/link/redeem` | Signs in with a password, mails a link, or signs in with one |
| `GET /auth/me`, `GET /auth/csrf`, `POST /auth/refresh`, `POST /auth/sign-out`, `PUT /auth/password` | The session and the signed-in user's password |
| `/users` | Admins invite, change, and remove users, and see each user's workspaces and roles. An invite that is not mailed answers its link. |
| `GET /settings` | For admins: both addresses, the mail, the database without its password, and the days the log keeps an entry, each with whether configuration sets it. The server token is never answered. |
| `PUT /settings/log` | For admins: from `{"days"}`, 1 to 365, sets how many days the log keeps an entry |
| `GET /log?workspace=&source=&level=&before=&instance=` | The [Log page](logs.md)'s entries: newest first, 100 at a time, with `next` for the older ones. `level=Warning` keeps warnings and errors, and an admin's `instance=true` keeps the entries about the whole instance. |
| `PUT /settings/addresses` | From `{"clientOrigin", "apiOrigin"}`, changes the addresses |
| `PUT` and `DELETE /settings/mail`, `POST /settings/mail/test` | From `{"serverToken", "from", "fromName"}`, sets Postmark's token and the sender, or turns mail off, and mails the admin to check it. A blank token keeps the stored one. |
| `PUT /settings/database` | From the installer's fields, moves Scry to another database once it opens and is up to date. A blank password keeps the stored one for the same server, database, and user. |
| `GET /ingest` | Push API: names the key the request carries, by its name and prefix |
| `PUT /ingest/sources/{name}` | Push API: makes a source from `{"columns": [{"name", "type"}], "primaryKey": [...], "origin"}`, or adds columns to one. `origin`, optional, says where the rows come from, up to 500 characters, and the Sources page shows it. |
| `POST /ingest/sources/{name}/batches` | Push API: from `{"id", "mode", "rows": [[...]]}`, appends the rows or merges them by the key, in one transaction; a batch id already written is skipped |
| `POST /ingest/sources/{name}/replace` | Push API: starts a replacement, with new columns or the source's own, and an `origin` as `PUT` takes; batches go to it until a commit |
| `POST /ingest/sources/{name}/commit` | Push API: swaps a replacement in, and answers the source with its row count |

The Nexus routes answer 409 while the workspace is unlinked, and 502 with Nexus's own words when Nexus refuses. A source pushed with
the link's push key is listed with `kind` `Nexus`.

- A source name starts with a lowercase letter and holds lowercase letters, digits, and underscores, 63 at most.
  A name taken in the workspace answers 409. The file can be up to 1 GB.
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
- A workspace's routes answer 404 to a user outside it. A viewer gets 403 on all but its dashboards, its list of
  sources, and the chart and row queries its dashboards make.
- The push API's routes take a key as `Authorization: Bearer <key>`, and no session. A key writes into its own
  workspace, and only to the sources it made.
  A pushed source whose key was revoked becomes the next key's to write to it.
  The client's `/docs/push-api` page is the reference for people using it: column types, modes, limits, and answers.
- The API applies its EF migrations each time it opens a database: at a start, and when the installer or the
  Settings page sets one.
