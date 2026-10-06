import { playClickSound } from '../utils/soundEngine.js'

export default function IntelModal({ isOpen, onClose }) {
  if (!isOpen) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="intel-modal" onClick={(e) => e.stopPropagation()}>
        {/* Corner Accents */}
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="modal-badge">CLASSIFIED // OSINT</span>
            <h2 className="modal-title">MISSION CONTROL INTEL & CONTROLS</h2>
          </div>
          <button
            className="modal-close-btn"
            onClick={() => { playClickSound(); onClose() }}
          >
            ✕ CLOSE
          </button>
        </div>

        <div className="modal-body">
          {/* Data Sources Grid */}
          <section className="modal-section">
            <h3 className="section-title">📡 REAL-TIME TELEMETRY DATA PIPELINES</h3>
            <div className="intel-grid">
              <div className="intel-card">
                <div className="card-top">
                  <span className="card-icon">✈️</span>
                  <span className="card-feed">OPENSKY NETWORK</span>
                </div>
                <p className="card-desc">
                  Live 1090MHz ADS-B transponder data capturing aircraft velocity, barometric altitude, true track heading, and origin country.
                </p>
              </div>

              <div className="intel-card">
                <div className="card-top">
                  <span className="card-icon">🛰️</span>
                  <span className="card-feed">CELESTRAK & NORAD</span>
                </div>
                <p className="card-desc">
                  Two-Line Element (TLE) ephemeris tracking real-time orbital paths for ISS (Zarya), Hubble, Tiangong, and active satellites.
                </p>
              </div>

              <div className="intel-card">
                <div className="card-top">
                  <span className="card-icon">🌋</span>
                  <span className="card-feed">USGS HAZARDS</span>
                </div>
                <p className="card-desc">
                  United States Geological Survey real-time earthquake feeds delivering moment magnitude, epicenter coordinates, and focal depth.
                </p>
              </div>
            </div>
          </section>

          {/* Keybindings Cheat Sheet */}
          <section className="modal-section">
            <h3 className="section-title">⌨️ TACTICAL KEYBOARD SHORTCUTS</h3>
            <div className="shortcuts-grid">
              <div className="shortcut-item">
                <kbd>SPACE</kbd>
                <span>Toggle 360° Cinematic Orbit</span>
              </div>
              <div className="shortcut-item">
                <kbd>R</kbd>
                <span>Reset Camera View</span>
              </div>
              <div className="shortcut-item">
                <kbd>M</kbd>
                <span>Toggle Great-Circle Distance Ruler</span>
              </div>
              <div className="shortcut-item">
                <kbd>/</kbd> or <kbd>F</kbd>
                <span>Focus Search Filter Bar</span>
              </div>
              <div className="shortcut-item">
                <kbd>1</kbd> - <kbd>4</kbd>
                <span>Switch Data Layers (All / Air / Space / Seismic)</span>
              </div>
              <div className="shortcut-item">
                <kbd>H</kbd> or <kbd>?</kbd>
                <span>Open / Close Mission Intel</span>
              </div>
              <div className="shortcut-item">
                <kbd>ESC</kbd>
                <span>Clear Selected Target / Close Modals</span>
              </div>
            </div>
          </section>

          {/* Navigation Controls */}
          <section className="modal-section">
            <h3 className="section-title">🖱️ 3D INTERACTION CONTROLS</h3>
            <div className="mouse-controls">
              <div className="mouse-item">
                <span className="mouse-lbl">LEFT CLICK + DRAG</span>
                <span className="mouse-val">Orbit & Rotate Globe</span>
              </div>
              <div className="mouse-item">
                <span className="mouse-lbl">RIGHT CLICK + DRAG</span>
                <span className="mouse-val">Pan Camera Viewport</span>
              </div>
              <div className="mouse-item">
                <span className="mouse-lbl">SCROLL WHEEL</span>
                <span className="mouse-val">Optical Zoom (3.0x - 15.0x)</span>
              </div>
              <div className="mouse-item">
                <span className="mouse-lbl">CLICK TARGET</span>
                <span className="mouse-val">Raycast Target Lock & Telemetry Card</span>
              </div>
            </div>
          </section>
        </div>

        <div className="modal-footer">
          <span className="footer-sys">UGLOBE REAL-TIME TELEMETRY SYSTEM v2.4</span>
          <button
            className="footer-btn"
            onClick={() => { playClickSound(); onClose() }}
          >
            ACKNOWLEDGE & RETURN
          </button>
        </div>
      </div>
    </div>
  )
}
