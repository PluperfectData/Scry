# Users and workspaces

[Documentation](README.md) › Users and workspaces

## Users and sign-in

There is no sign-up. An admin invites each user from the Users page, in the account menu, and changes the instance's
settings.

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

## Workspaces

Everything a user works with belongs to a workspace: its dashboards, its sources, its push keys, its link to Nexus, and
its own DuckDB file and uploads under `data/workspaces/<id>`. A chart reads only its workspace's sources, and each
workspace pairs with Nexus on its own.

- Admins make, rename, and remove workspaces on the Workspaces page, in the account menu, and are editors in every one.
  They add members on a workspace's Settings page, each as an editor or a viewer.
- An editor changes the workspace's dashboards, sources, push keys, and Nexus link. A viewer opens its dashboards,
  full screen included, and changes nothing.
- The header's workspace menu switches between them, and `/` opens the one last opened in the browser, or the first by
  name. With none, an admin is offered to make one.
- Removing a workspace takes its name, typed. Its rows and its folder go, and nothing brings them back.
- A database from before workspaces moves its dashboards, sources, keys, and Nexus link into a workspace named
  Default, whose folder is `data/workspaces/default`. Users who are not admins join no workspace until an admin adds
  them.
