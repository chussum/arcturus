<p align="center">
  <img src="./docs/assets/mascot.svg" width="200" alt="Arky, the Arcturus mascot — a baby bear hugging a star">
</p>
<p align="center"><em>Arky — the little bear that keeps your apps shining</em></p>

# ✦ Arcturus

**English** | [한국어](./README.ko.md)

A self-hosted PaaS for small teams. Push a project from the CLI (or drop in a zip) and it's running on your own server seconds later — static sites and Dockerfile apps both.

## Features

- 🚀 **One command and it's live.** Zip a folder or run `arcturus deploy`. Static sites are served straight from disk; if there's a `Dockerfile`, Arcturus builds the image and runs it as a container. Either way you get a clean URL at `http://<host>:7778/<username>/<app>`. (Even a single `.html` file works — it becomes the index.)
- ⏮️ **Rollback is one click.** Every app keeps its last 5 releases, so jumping back to a version that worked is a button in the dashboard or `arcturus rollback`.
- 🔐 **Env vars are encrypted.** Per-app environment variables are stored AES-256-GCM encrypted in SQLite. Saving them recreates the container right away — no rebuild.
- 🛡️ **Safe by default.** Deployed apps run on a separate origin, so an app can't ride a logged-in dashboard session. Containers are locked down (capabilities dropped, no-new-privileges, memory caps, isolated network), logins are rate-limited, and logging out kills the session on the server.
- 👥 **Made for a team.** The admin hands out invite links and everyone manages their own apps. Share an app as `view` (read-only) or `manage` (full operation), and a `manage` teammate can deploy to it too.
- ♻️ **No downtime when you redeploy.** The dashboard and API swap blue-green behind an ingress, so `:7777` and `:7778` keep answering while you ship.
- 🌐 **Korean and English.** The dashboard, API messages, and the CLI all speak both, following the browser or the `ARCTURUS_LANG` setting.

## Quick start

You'll need [Bun](https://bun.sh) 1.3+, and Docker if you want to run container apps.

<details>
<summary><strong>Installing Docker without Docker Desktop</strong> (license-free)</summary>

Arcturus talks to the Docker API socket directly, so you never need Docker Desktop — which is handy, since Desktop requires a paid subscription at companies with 250+ employees or $10M+ in annual revenue. The options below are free open source for any commercial use.

**Linux server** — Docker Engine (Apache 2.0):

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # re-login afterwards
```

**macOS** — Colima (MIT) plus the docker CLI via Homebrew:

```bash
brew install colima docker
colima start
```

Colima runs Docker inside a tiny Linux VM and exposes it as a *socket* — a local file that programs use to talk to Docker. The `docker` command finds this socket on its own, but Arcturus only looks at the `DOCKER_HOST` environment variable, so you point it there once.

Because Arcturus starts from your shell (through pm2), put the variable in your shell's startup file — **not** in `apps/api/.env`. On a modern Mac that's `~/.zshrc` (use `~/.bashrc` on bash):

```bash
echo 'export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock' >> ~/.zshrc
source ~/.zshrc   # applies to the current terminal; new ones pick it up automatically
```

`$HOME` expands to your home folder (e.g. `/Users/you`), so this points at the socket Colima creates at `~/.colima/default/docker.sock`. If Arcturus is already running, restart it from this terminal: `bun run server:up`.

</details>

```bash
git clone <repo-url> && cd arcturus
bun run server:up
```

That's the whole setup. It installs dependencies, builds the dashboard on the first run, and starts everything under pm2. Open `http://<host>:7777` and you're in. On the first run, when no encrypted `.env.secrets` exists yet, `server:up` offers three ways to set up the production secrets — **1) auto-generate** them, **2) enter** your own `ARCTURUS_ENV_KEY`/`ARCTURUS_JWT_SECRET`, or **3) just print a guide** for injecting them via environment variables — then asks you to set the admin password right in the terminal. Set the keys (or `ARCTURUS_ADMIN_PASSWORD`) beforehand to skip the prompts; with no terminal (CI/pm2) it prints the guide and exits instead of booting half-configured.

| Command | What it does |
|---|---|
| `bun run server:up` | Install, then start. Safe to run again any time (builds on the first run if there's no cached output) |
| `bun run server:up -- --build` | Full redeploy with **no downtime** — blue-green rebuild of the dashboard plus a blue-green API swap, gateway stays up the whole time |
| `bun run server:up -- --api` | **Zero-downtime** API swap — blue-green restart behind the ingress; use it after a config change |
| `bun run server:up -- --ingress` | Restart the ingress front-proxy (brief gap on `:7777`/`:7778`; only needed when `ingress.ts` itself changes) |
| `bun run server:restart` | Shorthand for `server:up -- --api` |
| `bun run server:down` | Stop everything |
| `bun run server:status` | Process status |
| `bun run server:logs` | Tail the logs |

## CLI

Install it with one line — your server hosts the installer and the platform binaries:

```bash
curl -fsSL http://<host>:7777/install.sh | sh
```

> Build the binaries on the server first: `cd apps/cli && bun run build:all`

```bash
arcturus login --server http://<host>:7777 --token <arc_...>   # token from Dashboard → API Tokens
arcturus deploy                  # zip the current directory and deploy (Dockerfile → container)
arcturus apps                    # list your apps
arcturus deployments <app>       # history (live / rollbackable markers)
arcturus rollback <app> <id>     # restore a previous release
arcturus env <app> --set K=V     # env vars (recreates the container)
arcturus logs <app>              # follow container logs
arcturus destroy <app>           # delete the app
```

Options for `arcturus deploy`:

| Option | Description |
| --- | --- |
| `--name <appName>` | App name (defaults to `arcturus.json` `"name"`, otherwise the directory name) |
| `--name <owner>/<appName>` | Deploy to another account's app you have **`manage`** access to (the app must already exist) |
| `--dir <path>` | Project directory to deploy (default: `.`) |
| `--env-file <path>` | Env file to read for a **new container app** (default: `.env` in the directory) |
| `--no-env-file` | Don't read any `.env` file |

**Deploying to a shared app.** With `manage` access you can deploy to a teammate's app via `--name <owner>/<app>`. If you use a **bare** name (like `--name blog`, or no `--name`) and an app with that name exists under another owner that you `manage`, an interactive terminal asks which one to deploy to (your own account is the default). On a non-TTY like CI it always targets your own account.

**Auto `.env` for container apps.** When you deploy a directory that has a `Dockerfile`, Arcturus reads its `.env` (or `--env-file`), stores the values as the app's env **encrypted at rest** — the same as setting them by hand — and applies them to the container. This only happens the **first time** the app is created; later redeploys leave the existing env alone (change it with `arcturus env` or the dashboard). Every `.env*` file (`.env`, `.env.local`, `.env.production`, …) is always **left out of the build image**, so secrets never end up in an image layer.

Pin an app name per project with `arcturus.json`: `{ "name": "my-app" }`

## How routing works

Path-prefix proxying (`/alice/blog`) breaks apps that reference assets by absolute path. Arcturus handles this three ways:

1. **Prefix strip + `X-Forwarded-Prefix`** — apps with a configurable base path work as-is.
2. **Referer fallback** — an unmatched request like `/static/app.js` is re-routed to the app the browser is currently viewing.
3. **Dedicated port** — every container app gets a fixed port (`30000+`) with no base-path issues at all. New container apps default to the "redirect" mode (the gateway URL 302-redirects to the dedicated port); switch an app back to "proxy" on its detail page if you prefer path-based serving.

## Configuration

Copy the examples and adjust as needed — every value is optional and the defaults are sensible:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

The secrets aren't in this table on purpose. `ARCTURUS_JWT_SECRET` and `ARCTURUS_ENV_KEY` are managed in the dotenvx-encrypted `.env.secrets` at the repo root via `bun run secrets:init` (values there take precedence over `apps/api/.env`), and `ARCTURUS_ADMIN_PASSWORD` is set via env or prompted in the terminal on first run. All three are generated automatically for local dev and **required in production** — see Security notes.

| Env var | Default | Description |
|---|---|---|
| `ARCTURUS_PORT` | `7777` | Control-plane public port (API + dashboard) |
| `ARCTURUS_APPS_PORT` | `7778` | Separate origin for deployed apps (keeps app code away from the control-plane cookie) |
| `ARCTURUS_DATA_DIR` | `./data` | SQLite, static releases, build workspace |
| `ARCTURUS_PORT_POOL_START/END` | `30000`/`30999` | Dedicated port pool for container apps |
| `ARCTURUS_MAX_UPLOAD_MB` | `256` | Upload size limit |
| `ARCTURUS_KEEP_RELEASES` | `5` | Releases kept per app for rollback |
| `ARCTURUS_DEFAULT_MEMORY_MB` | `1024` | Default container memory cap (per-app override in the dashboard) |
| `ARCTURUS_MAX_MEMORY_MB` | `4096` | Ceiling a per-app memory limit may not exceed |
| `ARCTURUS_CONTAINER_USER` | — | Force deployed containers to run as this user (e.g. `1000:1000`); empty honors the image's `USER` |
| `ARCTURUS_CLI_DIST` | `apps/cli/dist/cli` | Cross-compiled CLI binaries to serve |
| `ARCTURUS_DEV_ORIGINS` | — | Extra allowed origins for `next dev` |
| `ARCTURUS_TRUST_PROXY` | — | Set this when you run behind a TLS-terminating reverse proxy (an Express `trust proxy` value, e.g. `1`). Without it Secure cookies are never set and per-IP rate limits key on the proxy's IP |

### Multiple instances on one machine

Several Arcturus instances can share a host — for example, one per OS account on a shared Mac:

- Give each instance its own `ARCTURUS_PORT` **and `ARCTURUS_APPS_PORT`** — the ingress won't start if either is already taken. Internal ports for blue-green swaps are picked automatically with a bind-probe that even spots ports held by other OS accounts, so you don't have to coordinate those.
- The container port pool can overlap: before assigning a port, Arcturus checks that it's actually bindable on the host (not just unused in its own DB), and the scan starts at a random offset so concurrent deploys rarely race. Separate `ARCTURUS_PORT_POOL_START/END` ranges per instance are still nice for tidiness.
- If an app's dedicated port gets taken while the app is down (say, by another instance), the next deploy notices the collision, assigns a fresh port, and retries — the deploy log records the change. Note that the dedicated URL changes in that case.

### Security notes

Sensible defaults, with the details here if you want them.

**Secrets and keys**

- **Env vars are encrypted at rest.** App env vars are stored AES-256-GCM encrypted in SQLite. The key comes from `ARCTURUS_ENV_KEY`, or is generated once as `data/env-key` (mode `0600`); `data/` is `0700` and the DB files `0600`. Lose or change the key and existing values can't be decrypted. Old plaintext rows are re-encrypted on the next boot. The plaintext key file is a zero-config convenience, not recommended for a long-lived server.
- **`bun run secrets:init` (macOS) takes the keys off disk.** It moves `ARCTURUS_ENV_KEY` and `ARCTURUS_JWT_SECRET` into a dotenvx-encrypted `.env.secrets` and keeps the only decryption key in the macOS Keychain (service `arcturus-dotenvx`). The server wrapper re-fetches it on every restart, so no secret lives on disk or in pm2's dump. Existing key files are migrated as-is, so encrypted env rows and live sessions survive — and when neither key nor file exists yet, fresh ones are generated. `server:up` runs this for you on the first production boot (menu option 1); pass `--input` to type/paste your own values instead of generating them.
  - Add or change a secret later: write `KEY=value` into `.env.secrets`, run `bun run secrets:update` (or `bunx dotenvx set KEY value -f .env.secrets`), then `bun run server:restart`.
  - Back up the key before switching machines: `security find-generic-password -s arcturus-dotenvx -w`.
  - Linux has no Keychain — export the two env vars yourself, or stay on the file fallback (the API warns when it's running on plaintext key files).
- **Production needs all three secrets.** With `NODE_ENV=production`, `ARCTURUS_JWT_SECRET`, `ARCTURUS_ENV_KEY` and `ARCTURUS_ADMIN_PASSWORD` must be set or the server refuses to boot — no quiet fallback to a plaintext key file (a leaked file forges sessions and decrypts every stored env var), and no generated admin password in world-readable logs. The auto-generated fallbacks are for local and dev only. The pm2 `logs/` dir is created `0700`.

**Sessions, passwords, and tokens**

- **Logout revokes the session on the server.** Session JWTs carry a `jti` backed by a `sessions` row in SQLite; logging out deletes the row, so a leaked cookie stops working right away instead of lasting until its 7-day expiry.
- **Password changes revoke every session.** Members change their own password from **Dashboard → Account** (current password required); all other sessions are invalidated and a fresh one is issued for the current device. Admins can generate a one-time, one-hour reset link from the **Team** page — opening it lets the member set a new password without the old one, and revokes all their sessions.
- **API tokens can expire.** Pick 30, 90, or 365 days, or no expiry. Expired tokens are rejected at authentication, on top of manual revocation.
- **Auth and deploys are rate-limited.** Login, signup, and token creation are capped at 10 requests/minute per IP; deployments at 20/minute, since each build is CPU- and disk-heavy.

**Containers and builds**

- **Deployed containers run locked down.** All Linux capabilities dropped (`CapDrop: ALL`), `no-new-privileges`, CPU/PID limits, and a per-app memory cap (dashboard; default `ARCTURUS_DEFAULT_MEMORY_MB`, ceiling `ARCTURUS_MAX_MEMORY_MB`). They sit on a dedicated bridge network (`arcturus-apps`) with inter-container communication off, so one tenant's app can't reach another's. They honor the image's `USER` by default; set `ARCTURUS_CONTAINER_USER` (e.g. `1000:1000`) to force a non-root user.
- **Image builds are sandboxed too.** An untrusted `Dockerfile` builds with the same memory cap on the same isolated network, so a `RUN` step can't reach other tenants' containers (outbound egress for dependency installs is kept).
- **Known limitation: containers can still reach the host.** The `arcturus-apps` bridge blocks container↔container traffic, but not container→host. A malicious app (or build `RUN` step) can reach host-bound services, including the control plane (every API call needs auth) and other apps' published ports. Fully blocking that needs `DOCKER-USER` iptables on Linux and isn't possible under Docker Desktop on macOS, so treat deployed code as semi-trusted.

**Origins and network**

- **Apps run on a separate origin.** Deployed apps live on `ARCTURUS_APPS_PORT` (default `:7778`), apart from the control plane (`:7777`). The apps listener only serves apps, and the API rejects cookie-authenticated cross-origin writes (an Origin / `Sec-Fetch-Site` check), so a malicious app can't drive the API with a logged-in visitor's session. Old `:7777/<user>/<app>` links 302-redirect to the apps origin; CLI bearer-token requests aren't affected. (Cookies aren't port-scoped, so the port split alone isn't enough — the Origin check is what enforces it, since same-host apps are still same-*site*.)
- **Forwarded headers are sanitized.** The gateway strips client-supplied `X-Forwarded-*` and re-adds the values it actually observed, so apps can trust the real client IP instead of a spoofable one.
- **Dedicated ports are public.** Container apps are also reachable directly on their dedicated host port (bound on `0.0.0.0`), which the "jump to dedicated port" mode relies on. Keep the port pool firewalled to your team's network.

**Uploads and dependencies**

- **Uploads are bounded.** Archives are rejected past 2 GiB uncompressed or 10,000 entries (on top of the compressed upload cap), and zip entries that escape the root or are symlinks are refused — so a decompression bomb can't fill the disk.
- **New npm releases wait 7 days.** Dependency installs skip npm versions younger than 7 days (`minimumReleaseAge` in `bunfig.toml`), giving a compromised release time to be caught and unpublished before it reaches this repo. Exempt an urgent patch per package via `minimumReleaseAgeExcludes`.

## Architecture

```
apps/api/        NestJS — REST API, reverse-proxy gateway, deploy pipeline (runs on Bun)
apps/web/        Next.js dashboard — Rspack bundler + Linaria zero-runtime CSS, FSD architecture
apps/cli/        arcturus CLI — single binary via `bun build --compile`
packages/shared/ API contract types shared by api/web/cli
```

SQLite via Drizzle, with repositories behind ports, so moving to PostgreSQL is a module swap. Docker via dockerode behind a `ContainerRuntime` port. Static releases live in versioned directories; container releases are per-deployment image tags.

## Development

```bash
bun run lint            # biome check
bun test apps/api       # unit tests
cd apps/web && bun run dev   # dashboard dev server (:3000, HMR)
```

See [CLAUDE.md](./CLAUDE.md) for architecture rules, design-system tokens, and known pitfalls.

The project site (GitHub Pages) lives in [`docs/`](./docs/) — plain static HTML/CSS in English and Korean, deployed by `.github/workflows/pages.yml` (enabled via the `ENABLE_PAGES` repository variable once the repo is public).

## License

[MIT](./LICENSE). The distributed CLI binaries bundle third-party software — see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
