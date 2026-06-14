# MangaZap

AI-powered manga video generator.

## Quick Start

### Linux / macOS

```bash
# Install dependencies
pip install poetry
poetry install

# Start server
poetry run uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

### Windows Deployment

#### Option 1: WSL2 (Recommended)

```bash
# 1. Install WSL2
wsl --install

# 2. Restart, open WSL terminal
# 3. Install Python and dependencies
sudo apt update
sudo apt install python3.12 python3-pip ffmpeg

# 4. Clone project
git clone https://github.com/mangazap/mangazap.git
cd mangazap

# 5. Install dependencies
pip install poetry
poetry install

# 6. Start server
poetry run uvicorn backend.app.main:app --reload
```

#### Option 2: Docker Desktop

```bash
# 1. Install Docker Desktop
# Download: https://docs.docker.com/desktop/install/windows-install/

# 2. Start Docker Desktop

# 3. Clone and run
git clone https://github.com/mangazap/mangazap.git
cd mangazap
docker compose up
```

#### Native Windows (Not Recommended)

```bash
# 1. Install Python 3.12
# Download: https://www.python.org/downloads/

# 2. Install FFmpeg
# Download: https://ffmpeg.org/download.html
# Add ffmpeg.exe directory to system PATH

# 3. Clone project
git clone https://github.com/mangazap/mangazap.git
cd mangazap

# 4. Install dependencies
pip install poetry
poetry install

# 5. Start server
poetry run uvicorn backend.app.main:app --reload
```

### Windows Platform Limitations

> **Warning**: Native Windows has the following limitations:

- **Process isolation unavailable**: Security executor degrades to thread mode
- **API key risk**: Keys may persist in memory
- **Recommendation**: Use WSL2 or Docker Desktop for production

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/platform` | Platform info and security level |
| POST | `/api/error-reports/generate` | Generate error report |
| GET | `/api/error-reports/{id}` | Get error report by ID |

## Template Signature Notice

> **Important**: Template signatures are toy-level, used only for marking source (official/community). Real integrity depends on HTTPS transport from GitHub Releases.

## Security Declaration

- **Linux/macOS/Docker/WSL**: Process isolation, keys cleared on exit
- **Windows**: Thread mode, keys may persist in memory
- **Template integrity**: Relies on HTTPS, not signatures

## License

MIT
