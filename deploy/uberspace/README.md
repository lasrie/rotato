# Migration auf eigenen CSS (Uberspace, Asteroid rotato)

## Schnellstart

```bash
ssh rotato@ymir.uberspace.de
bash -s < setup-css.sh        # oder: scp + bash setup-css.sh
```

Danach DNS in Cloudflare:

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `solid` | `rotato.uberspace.de` | **DNS only** |

## Nach dem ersten Start

1. `https://solid.lasrie.dev/` im Browser öffnen → Account registrieren
2. Pod anlegen (Name: `garten`)
3. Client-Credentials auf der Account-Seite erzeugen
4. Lokale `.env` umstellen:
   ```
   POD_BASE=https://solid.lasrie.dev/garten/
   SOLID_IDP=https://solid.lasrie.dev
   SOLID_CLIENT_ID=<neu>
   SOLID_CLIENT_SECRET=<neu>
   ```
5. Daten migrieren (lokal im Repo):
   ```bash
   node scripts/sync_to_pod.mjs --force
   ```
6. Login-Test: `https://garden.lasrie.dev/plan.html` → Anmelden

## Troubleshooting

- `supervisorctl status css` → RUNNING?
- Log: `tail -f ~/css/css.log`
- Backend-Status: `uberspace web backend list`
- Falls CSS nicht startet: Port belegt? `ss -tlnp | grep 3457`
