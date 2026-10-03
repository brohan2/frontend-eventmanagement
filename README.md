# Event Management — Admin Web App

The browser front end for the Event Management system: event selection, attendee import, email and WhatsApp
sending (with multiple WhatsApp accounts per event), send status, logs, and event-day check-in by QR scan.

It is a static React + Vite app. **All data lives in the backend API** — this repository contains no attendee
data and no secrets, and none must ever be added (everything in a `VITE_*` variable is compiled into the public
bundle).

## Local development

```bash
cp .env.example .env     # VITE_API_URL=http://localhost:3000
npm install
npm run dev              # http://localhost:5173
```

The backend must be running and must allow this origin (`FRONTEND_ORIGIN` on the server).

## Configuration

| Variable | Meaning |
|---|---|
| `VITE_API_URL` | Address of the backend API, e.g. `https://203-0-113-10.sslip.io`. **Must be `https://` in production.** |
| `VITE_BASE` | Base path. Set automatically by the deploy workflow (`/<repo-name>/`); leave unset locally. |

## Deployment (GitHub Pages)

Every push to `main` builds the app and publishes it through `.github/workflows/deploy-pages.yml`.

One-time setup in the repository settings:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**
2. **Settings → Secrets and variables → Actions → Variables → New repository variable**
   `VITE_API_URL` = the backend's `https://` address
3. Push to `main` (or run the workflow from the Actions tab). The site appears at
   `https://<owner>.github.io/<repo-name>/`.

The backend must then allow that **origin** — the address without the path, e.g. `https://<owner>.github.io` —
as its `FRONTEND_ORIGIN`, otherwise the browser blocks every request.

## Notes

- The published site is public: anyone with the link can open the login page. Access to data is controlled by
  the backend login, not by hiding the site.
- `npm run lint` currently reports pre-existing issues; the deploy workflow does not gate on it.
