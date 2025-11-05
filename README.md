# iCloud CalDAV Bridge (UTC)

Creates iCloud Calendar events via CalDAV using an Apple app-specific password.

## Endpoints
- `GET /health` (requires `x-bridge-key`)
- `POST /events` JSON body:
  {
    "summary": "Coffee with Maya",
    "description": "Lobby",
    "location": "HQ",
    "start": "2025-11-05T13:00:00-05:00",
    "end":   "2025-11-05T13:30:00-05:00"
  }

Times should include an offset (e.g., `-05:00`). The server converts to UTC for iCloud.
