# SSL Pilot CLI — Setup Guide

`sp` is the SSL Pilot command-line tool. It lists, downloads, and auto-renews your SSL certificates.

---

## 1. Install

```bash
curl -fsSL https://raw.githubusercontent.com/nafishahmeddev/ssl-pilot/main/apps/cli/install.sh | sudo bash
```

This downloads the correct binary for your system and installs it to `/usr/local/bin/sp`.

---

## 2. Get an API Key

1. Log in to the SSL Pilot dashboard
2. Go to **API Keys** → **Create Key**
3. Copy the key — it is shown only once

---

## 3. Quick Usage (no service)

Export your key, then run commands:

```bash
export SSL_PILOT_API_KEY='sslpilot_...'

# List all certificates
sp list

# Download interactively (pick from list)
sudo sp download

# Download a specific domain
sudo sp download '*.example.com'

# Download by ID
sudo sp download --id <cert-id>
```

Certificates are saved to `/etc/ssl-pilot/<domain>/`:

| File | Path |
|------|------|
| Certificate | `/etc/ssl-pilot/example.com/certificate.crt` |
| Private key | `/etc/ssl-pilot/example.com/private.key` |

> `sp download` requires `sudo` because it writes to `/etc/ssl-pilot/`.

---

## 4. Background Service (auto-renewal)

The service monitors your certificates and automatically re-downloads them before they expire.

### Install the service

```bash
export SSL_PILOT_API_KEY='sslpilot_...'   # optional — will be prompted if not set
sudo -E sp service install
```

You will be asked:

| Question | Default | Description |
|----------|---------|-------------|
| API key | — | Your `sslpilot_...` key |
| API URL | `https://ssl.idexa.app` | Leave blank unless self-hosted |
| Renew within (days) | `30` | Download when expiry is within N days |
| Check interval (hours) | `12` | How often to check |
| Watch specific domains | blank = all | Comma-separated list, e.g. `*.example.com, api.example.com` |

After setup, the service starts automatically.

### Service commands

```bash
sp service status        # show current status
sp service check         # run one check cycle right now (for testing)
sudo sp service start    # start the service
sudo sp service stop     # stop the service
sudo sp service uninstall  # remove the service (keeps certs and config)
```

### Follow logs

```bash
journalctl -u ssl-pilot -f
```

---

## 5. Hooks (run scripts after download)

Hooks let you reload your web server (or do anything else) whenever a certificate is saved.

Hook scripts live in `/etc/ssl-pilot/hooks/`:

| File | When it runs |
|------|-------------|
| `global.sh` | After every certificate download |
| `example.com.sh` | After `example.com` downloads |
| `wildcard.example.com.sh` | After `*.example.com` downloads |

Hook stubs are created automatically by `sp service install`. Edit them:

```bash
nano /etc/ssl-pilot/hooks/global.sh
```

### Available environment variables

| Variable | Example value |
|----------|--------------|
| `SSL_PILOT_CERT_NAME` | `*.example.com` |
| `SSL_PILOT_DOMAIN` | `example.com` |
| `SSL_PILOT_CERT_PATH` | `/etc/ssl-pilot/example.com/certificate.crt` |
| `SSL_PILOT_KEY_PATH` | `/etc/ssl-pilot/example.com/private.key` |

### Example: reload nginx

```bash
#!/usr/bin/env bash
systemctl reload nginx
```

### Example: reload nginx + copy cert for a specific app

```bash
#!/usr/bin/env bash
cp "$SSL_PILOT_CERT_PATH" /etc/myapp/server.crt
cp "$SSL_PILOT_KEY_PATH"  /etc/myapp/server.key
systemctl restart myapp
```

---

## 6. File Layout

```
/etc/ssl-pilot/
  config.json                        Service configuration
  state.json                         Local expiry cache (used to skip unnecessary downloads)
  hooks/
    global.sh                        Runs after every download
    example.com.sh                   Runs after example.com downloads
    wildcard.example.com.sh          Runs after *.example.com downloads
  example.com/
    certificate.crt                  Certificate (chmod 644)
    private.key                      Private key  (chmod 600)
  wildcard.example.com/
    certificate.crt
    private.key
```

---

## 7. Uninstall

```bash
# Remove the background service
sudo sp service uninstall

# Remove the CLI binary
curl -fsSL https://raw.githubusercontent.com/nafishahmeddev/ssl-pilot/main/apps/cli/uninstall.sh | sudo bash
```

> Uninstall scripts prompt before deleting `/etc/ssl-pilot/` so your certificates are safe.
