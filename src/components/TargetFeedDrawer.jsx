import { useState, useMemo } from 'react'
import { playClickSound, playTargetLockSound } from '../utils/soundEngine.js'

export default function TargetFeedDrawer({
  isOpen,
  onClose,
  flights = [],
  satellites = [],
  earthquakes = [],
  selectedTarget,
  onSelectTarget,
  onFlyToTarget,
}) {
  const [tab, setTab] = useState('all') // 'all' | 'flights' | 'satellites' | 'earthquakes'
  const [search, setSearch] = useState('')

  // Sort and select top interesting items
  const feedItems = useMemo(() => {
    let list = []

    if (tab === 'all' || tab === 'flights') {
      const topFlights = [...flights]
        .sort((a, b) => (b.velocity || 0) - (a.velocity || 0))
        .slice(0, 50)
        .map(f => ({
          ...f,
          category: 'flight',
          displayTitle: f.callsign || 'FLIGHT',
          displaySub: `${f.originCountry || 'UNKNOWN'} · ${(f.altitude ? Math.round(f.altitude) : 8000).toLocaleString()}M`,
          badge: f.velocity ? `${Math.round(f.velocity * 3.6)} KM/H` : null,
          badgeColor: 'cyan',
          icon: '✈️',
        }))
      list.push(...topFlights)
    }

    if (tab === 'all' || tab === 'satellites') {
      const topSats = satellites.map(s => ({
        ...s,
        category: 'satellite',
        displayTitle: s.name,
        displaySub: `NORAD #${s.noradId} · ${s.altitudeKm}KM ALT`,
        badge: `${s.velocityKmS || 7.6} KM/S`,
        badgeColor: 'green',
        icon: '🛰️',
      }))
      list.push(...topSats)
    }

    if (tab === 'all' || tab === 'earthquakes') {
      const topQuakes = [...earthquakes]
        .sort((a, b) => (b.magnitude || 0) - (a.magnitude || 0))
        .map(q => ({
          ...q,
          category: 'earthquake',
          displayTitle: `M${q.magnitude?.toFixed(1)} ${q.title || 'SEISMIC'}`,
          displaySub: `${q.depth || 10}KM DEPTH`,
          badge: `M ${q.magnitude?.toFixed(1)}`,
          badgeColor: q.magnitude >= 5 ? 'crimson' : 'yellow',
          icon: '🌋',
        }))
      list.push(...topQuakes)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(item =>
        item.displayTitle.toLowerCase().includes(q) ||
        item.displaySub.toLowerCase().includes(q)
      )
    }

    return list
  }, [flights, satellites, earthquakes, tab, search])

  if (!isOpen) return null

  const handleItemClick = (item) => {
    playTargetLockSound()
    onSelectTarget(item)
    if (onFlyToTarget) {
      onFlyToTarget(item)
    }
  }

  return (
    <div className="target-feed-drawer">
      <div className="drawer-header">
        <div className="drawer-title-group">
          <span className="drawer-title">📡 LIVE TARGETS RADAR</span>
          <span className="drawer-count">{feedItems.length} TARGETS</span>
        </div>
        <button
          className="drawer-close-btn"
          onClick={() => { playClickSound(); onClose() }}
          title="Close Feed"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="drawer-tabs">
        <button
          className={`drawer-tab ${tab === 'all' ? 'active' : ''}`}
          onClick={() => { playClickSound(); setTab('all') }}
        >
          🌐 ALL
        </button>
        <button
          className={`drawer-tab ${tab === 'flights' ? 'active' : ''}`}
          onClick={() => { playClickSound(); setTab('flights') }}
        >
          ✈️ FLIGHTS
        </button>
        <button
          className={`drawer-tab ${tab === 'satellites' ? 'active' : ''}`}
          onClick={() => { playClickSound(); setTab('satellites') }}
        >
          🛰️ SATS
        </button>
        <button
          className={`drawer-tab ${tab === 'earthquakes' ? 'active' : ''}`}
          onClick={() => { playClickSound(); setTab('earthquakes') }}
        >
          🌋 QUAKES
        </button>
      </div>

      {/* Search Input */}
      <div className="drawer-search-box">
        <input
          type="text"
          placeholder="Filter feed (e.g. ISS, BA, M5)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="drawer-search-input"
        />
        {search && (
          <button className="drawer-search-clear" onClick={() => setSearch('')}>✕</button>
        )}
      </div>

      {/* Target Items List */}
      <div className="drawer-list">
        {feedItems.length === 0 ? (
          <div className="drawer-empty">NO TARGETS MATCH FILTER</div>
        ) : (
          feedItems.map((item, idx) => {
            const isSelected = selectedTarget && (
              (item.callsign && selectedTarget.callsign === item.callsign) ||
              (item.noradId && selectedTarget.noradId === item.noradId) ||
              (item.id && selectedTarget.id === item.id)
            )

            return (
              <div
                key={`${item.category}-${item.id || item.noradId || item.callsign || idx}`}
                className={`drawer-item ${isSelected ? 'selected' : ''}`}
                onClick={() => handleItemClick(item)}
              >
                <div className="item-icon-col">{item.icon}</div>
                <div className="item-info-col">
                  <div className="item-title">{item.displayTitle}</div>
                  <div className="item-sub">{item.displaySub}</div>
                </div>
                {item.badge && (
                  <div className={`item-badge ${item.badgeColor}`}>{item.badge}</div>
                )}
                <button
                  className="item-lock-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleItemClick(item)
                  }}
                  title="Lock Camera onto Target"
                >
                  🎯
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
