# Live Globe — Real-Time Flight Tracker

A rotating 3D Earth showing live commercial flights worldwide, built with
Three.js + React. Click any glowing point to see that aircraft's callsign,
altitude, speed, and heading.

## What's already working

- Textured, rotating 3D Earth with atmosphere glow and a starfield background
- Live data from the OpenSky Network API, refreshed every 45 seconds
- Click-to-select flights with a live info panel
- Graceful degradation: if the API is rate-limited or down, it keeps showing
  the last known data and shows a "Reconnecting…" status instead of breaking

## Run it locally

```bash
npm install
npm run dev
```

Open the local URL it prints (usually http://localhost:5173).

## Project structure

```
live-globe/
├── src/
│   ├── components/
│   │   ├── Globe.jsx       # the entire Three.js scene: earth, stars, points, clicks
│   │   └── InfoPanel.jsx   # UI card shown when a flight is selected
│   ├── hooks/
│   │   └── useFlights.js   # polls OpenSky, handles errors/caching
│   ├── utils/
│   │   └── coords.js       # lat/long → 3D sphere position math
│   ├── App.jsx             # wires everything together + HUD overlay
│   ├── main.jsx            # React entry point
│   └── index.css           # dark theme styling
├── index.html
├── package.json
└── vite.config.js
```

## Deploy for free (Vercel)

1. Push this repo to GitHub.
2. Go to vercel.com, sign in with GitHub, click "Add New Project", pick this repo.
3. Vercel auto-detects Vite — leave the default build settings, click Deploy.
4. You get a live URL (e.g. `live-globe.vercel.app`) in about a minute. Every
   future push to your main branch auto-redeploys.

No environment variables or API keys needed — OpenSky's anonymous tier works
without authentication (rate-limited, which is why data refreshes every 45s
rather than continuously).

## Known limitation

OpenSky's free/anonymous tier is rate-limited and occasionally slow or briefly
unavailable — this is expected, not a bug, and the app is built to handle it
gracefully (see `useFlights.js`).
