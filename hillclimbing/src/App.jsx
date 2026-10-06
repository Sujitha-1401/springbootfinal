import { useEffect, useRef, useState } from 'react'
import './App.css'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const terrainAt = (x, height) =>
  height * 0.72 +
  Math.sin(x * 0.0031) * 48 +
  Math.sin(x * 0.0067 + 1.4) * 23 +
  Math.sin(x * 0.00115 + 2.2) * 52

const createGame = () => ({
  x: 112,
  y: 0,
  vx: 0,
  vy: 0,
  angle: 0,
  fuel: 100,
  coins: 0,
  distance: 0,
  started: false,
  paused: false,
  crashed: false,
  airborne: false,
  collected: new Set(),
  held: new Set(),
  width: 960,
  height: 540,
  lastFrame: 0,
  hudTime: 0,
})

function App() {
  const canvasRef = useRef(null)
  const gameRef = useRef(createGame())
  const bestRef = useRef(null)
  const [hud, setHud] = useState({ distance: 0, coins: 0, fuel: 100, speed: 0 })
  const [best, setBest] = useState(() => Number(localStorage.getItem('ridgeline-best') || 0))
  const [mode, setMode] = useState('ready')

  const restart = () => {
    const game = gameRef.current
    const freshGame = createGame()
    freshGame.width = game.width
    freshGame.height = game.height
    freshGame.y = terrainAt(freshGame.x, freshGame.height) - 25
    gameRef.current = freshGame
    setHud({ distance: 0, coins: 0, fuel: 100, speed: 0 })
    setMode('ready')
  }

  const begin = () => {
    if (gameRef.current.crashed) restart()
    gameRef.current.started = true
    gameRef.current.paused = false
    setMode('running')
  }

  const togglePause = () => {
    const game = gameRef.current
    if (!game.started || game.crashed) return
    game.paused = !game.paused
    setMode(game.paused ? 'paused' : 'running')
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    let frameId

    const resize = () => {
      const game = gameRef.current
      const bounds = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      game.width = bounds.width
      game.height = bounds.height
      canvas.width = Math.round(bounds.width * pixelRatio)
      canvas.height = Math.round(bounds.height * pixelRatio)
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      if (!game.y) game.y = terrainAt(game.x, game.height) - 25
    }

    const drawCar = (x, y, angle) => {
      context.save()
      context.translate(x, y)
      context.rotate(angle)
      context.fillStyle = '#172624'
      for (const wheelX of [-29, 30]) {
        context.beginPath()
        context.arc(wheelX, 11, 14, 0, Math.PI * 2)
        context.fill()
        context.fillStyle = '#d6dfc8'
        context.beginPath()
        context.arc(wheelX, 11, 5, 0, Math.PI * 2)
        context.fill()
        context.fillStyle = '#172624'
      }
      context.fillStyle = '#ff684b'
      context.beginPath()
      context.moveTo(-47, 3)
      context.lineTo(-41, -12)
      context.quadraticCurveTo(-38, -18, -25, -18)
      context.lineTo(-11, -34)
      context.quadraticCurveTo(-7, -39, 2, -38)
      context.lineTo(25, -35)
      context.quadraticCurveTo(32, -34, 36, -25)
      context.lineTo(47, -17)
      context.lineTo(48, 4)
      context.quadraticCurveTo(46, 9, 39, 9)
      context.lineTo(-40, 9)
      context.quadraticCurveTo(-48, 9, -47, 3)
      context.fill()
      context.fillStyle = '#dbf1d6'
      context.beginPath()
      context.moveTo(-19, -18)
      context.lineTo(-8, -31)
      context.quadraticCurveTo(-5, -34, 2, -33)
      context.lineTo(13, -31)
      context.lineTo(18, -18)
      context.closePath()
      context.fill()
      context.fillStyle = '#ffc947'
      context.beginPath()
      context.arc(5, -20, 6, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = '#fff0a2'
      context.fillRect(39, -12, 7, 5)
      context.restore()
    }

    const draw = (time) => {
      const game = gameRef.current
      const { width, height } = game
      const dt = game.lastFrame ? Math.min((time - game.lastFrame) / 1000, 0.035) : 0
      game.lastFrame = time

      if (game.started && !game.paused && !game.crashed && dt > 0) {
        const driving = game.held.has('ArrowRight') || game.held.has('KeyD')
        const braking = game.held.has('ArrowLeft') || game.held.has('KeyA')
        if (driving && game.fuel > 0) {
          game.vx += 310 * dt
          game.fuel = Math.max(0, game.fuel - 2.6 * dt)
        }
        if (braking) game.vx -= 230 * dt
        game.vx *= Math.exp(-(driving || braking ? 0.12 : 0.55) * dt)
        game.vx = clamp(game.vx, -115, 510)
        game.x = Math.max(30, game.x + game.vx * dt)

        const groundLeft = terrainAt(game.x - 29, height) - 13
        const groundRight = terrainAt(game.x + 30, height) - 13
        const groundCenter = (groundLeft + groundRight) / 2 - 12
        const slopeAngle = Math.atan2(groundRight - groundLeft, 59)
        if (game.airborne) {
          game.vy += 820 * dt
          game.y += game.vy * dt
          game.angle += (slopeAngle - game.angle) * Math.min(dt * 1.8, 1)
          if (game.y >= groundCenter) {
            game.y = groundCenter
            game.vy = 0
            game.airborne = false
            if (Math.abs(game.angle - slopeAngle) > 1.22 && game.vx > 155) {
              game.crashed = true
              setMode('crashed')
            }
          }
        } else {
          game.y += (groundCenter - game.y) * Math.min(dt * 13, 1)
          game.angle += (slopeAngle - game.angle) * Math.min(dt * 12, 1)
        }

        game.distance = Math.max(game.distance, Math.floor(game.x / 10))
        for (let index = 0; index < 80; index += 1) {
          const coinX = 470 + index * 285
          const coinY = terrainAt(coinX, height) - 74 - (index % 3) * 10
          if (!game.collected.has(index) && Math.hypot(game.x - coinX, game.y - coinY) < 43) {
            game.collected.add(index)
            game.coins += 1
          }
        }
        if (game.vx < -100) {
          game.crashed = true
          setMode('crashed')
        }
        if (time - game.hudTime > 110) {
          setHud({
            distance: game.distance,
            coins: game.coins,
            fuel: game.fuel,
            speed: Math.round(Math.abs(game.vx) * 0.28),
          })
          if (bestRef.current === null) bestRef.current = Number(localStorage.getItem('ridgeline-best') || 0)
          if (game.distance > bestRef.current) {
            bestRef.current = game.distance
            localStorage.setItem('ridgeline-best', String(game.distance))
            setBest(game.distance)
          }
          game.hudTime = time
        }
      }

      const sky = context.createLinearGradient(0, 0, 0, height)
      sky.addColorStop(0, '#a9d9d2')
      sky.addColorStop(0.68, '#d8e8bd')
      sky.addColorStop(1, '#f0dba0')
      context.fillStyle = sky
      context.fillRect(0, 0, width, height)

      const cameraX = game.x - width * 0.34
      const cameraY = game.y - height * 0.57
      context.save()
      context.translate(-cameraX, -cameraY)
      for (let layer = 0; layer < 2; layer += 1) {
        context.fillStyle = layer === 0 ? 'rgba(49, 113, 101, 0.18)' : 'rgba(69, 126, 97, 0.24)'
        context.beginPath()
        context.moveTo(cameraX - 20, height + cameraY)
        for (let x = cameraX - 20; x <= cameraX + width + 30; x += 12) {
          const y = height * (0.53 + layer * 0.08) + Math.sin(x * (0.0017 + layer * 0.0007) + layer) * (31 + layer * 14)
          context.lineTo(x, y + cameraY * 0.12)
        }
        context.lineTo(cameraX + width + 30, height + cameraY)
        context.closePath()
        context.fill()
      }
      for (let index = 0; index < 80; index += 1) {
        const coinX = 470 + index * 285
        if (coinX < cameraX - 30 || coinX > cameraX + width + 30 || game.collected.has(index)) continue
        const coinY = terrainAt(coinX, height) - 74 - (index % 3) * 10
        context.fillStyle = '#f5bd37'
        context.beginPath()
        context.arc(coinX, coinY, 11, 0, Math.PI * 2)
        context.fill()
        context.strokeStyle = '#fff0a2'
        context.lineWidth = 3
        context.beginPath()
        context.arc(coinX, coinY, 6, 0, Math.PI * 2)
        context.stroke()
      }

      context.beginPath()
      context.moveTo(cameraX - 20, height + cameraY)
      for (let x = cameraX - 20; x <= cameraX + width + 30; x += 5) {
        context.lineTo(x, terrainAt(x, height))
      }
      context.lineTo(cameraX + width + 30, height + cameraY)
      context.closePath()
      const dirt = context.createLinearGradient(0, height * 0.65, 0, height + cameraY)
      dirt.addColorStop(0, '#739a50')
      dirt.addColorStop(0.045, '#638448')
      dirt.addColorStop(0.05, '#8e744e')
      dirt.addColorStop(1, '#695841')
      context.fillStyle = dirt
      context.fill()
      context.strokeStyle = '#eff0ba'
      context.lineWidth = 4
      context.beginPath()
      for (let x = cameraX - 20; x <= cameraX + width + 30; x += 5) {
        const y = terrainAt(x, height)
        if (x === cameraX - 20) context.moveTo(x, y)
        else context.lineTo(x, y)
      }
      context.stroke()
      drawCar(game.x, game.y, game.angle)
      context.restore()
      frameId = window.requestAnimationFrame(draw)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    frameId = window.requestAnimationFrame(draw)
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frameId)
    }
  }, [])

  useEffect(() => {
    const keyDown = (event) => {
      if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault()
      if (event.code === 'Escape' || event.code === 'KeyP') togglePause()
      if (!gameRef.current.started && ['Enter', 'Space', 'ArrowRight'].includes(event.code)) begin()
      if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
        const game = gameRef.current
        if (game.started && !game.paused && !game.crashed && !game.airborne) {
          game.vy = -390
          game.airborne = true
        }
      }
      gameRef.current.held.add(event.code)
    }
    const keyUp = (event) => gameRef.current.held.delete(event.code)
    const blur = () => gameRef.current.held.clear()
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', blur)
    }
  }, [])

  const setControl = (code, pressed) => {
    const game = gameRef.current
    if (pressed) {
      if (!game.started) begin()
      if (code === 'Space' && !game.airborne) {
        game.airborne = true
        game.vy = -390
      }
      game.held.add(code)
    } else {
      game.held.delete(code)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Ridgeline home">
          <span className="brand-mark"><i /><i /><i /></span>
          <span>RIDGELINE<span className="brand-sub">MOTOR CLUB</span></span>
        </a>
        <div className="session-tag"><span className="live-dot" /> SOLO SESSION <span className="tag-divider">/</span> 01</div>
      </header>

      <main className="game-page" id="top">
        <section className="heading-row">
          <div>
            <p className="eyebrow">ARCADE RUN <span>NO. 01</span></p>
            <h1>HILL<span>CLIMBER</span></h1>
          </div>
          <div className="record-stamp"><span>PERSONAL BEST</span><strong>{best.toString().padStart(4, '0')}<small> M</small></strong></div>
        </section>

        <section className="game-console" aria-label="Hill climber game">
          <div className="track-topline">
            <span><span className="track-light" /> RIDGELINE PASS</span>
            <span>ALT. 1,280 FT <b>·</b> WIND 08 MPH</span>
          </div>
          <div className="playfield">
            <canvas ref={canvasRef} aria-label="Hillclimber game field" />
            <div className="hud-bar">
              <div className="hud-stat distance-stat"><span>DISTANCE</span><strong>{hud.distance.toString().padStart(4, '0')}<small>m</small></strong></div>
              <div className="hud-stat coin-stat"><span>COINS</span><strong><i>✦</i> {hud.coins.toString().padStart(2, '0')}</strong></div>
              <div className="hud-stat speed-stat"><span>SPEED</span><strong>{hud.speed}<small>km/h</small></strong></div>
              <div className="fuel-stat"><span>FUEL</span><div className="fuel-track"><i style={{ width: `${hud.fuel}%` }} /></div></div>
            </div>

            {mode !== 'running' && (
              <div className="game-overlay">
                <div className="overlay-panel">
                  <span className="overlay-kicker">{mode === 'ready' ? 'ENGINE READY' : mode === 'paused' ? 'TAKE A BREATHER' : 'RUN ENDED'}</span>
                  <h2>{mode === 'ready' ? 'Find your line.' : mode === 'paused' ? 'Paused.' : 'Tumbled out.'}</h2>
                  <button className="start-button" onClick={mode === 'paused' ? togglePause : begin}>
                    {mode === 'ready' ? 'START RUN' : mode === 'paused' ? 'RESUME' : 'RIDE AGAIN'} <span>↗</span>
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="console-footer">
            <div className="run-readout"><span className="readout-dot" /> {mode === 'running' ? 'RUN IN PROGRESS' : mode === 'paused' ? 'PAUSED' : mode === 'crashed' ? 'RUN COMPLETE' : 'STANDING BY'}</div>
            <div className="console-actions">
              <button className="utility-button" onClick={togglePause} disabled={mode === 'ready' || mode === 'crashed'} aria-label={mode === 'paused' ? 'Resume game' : 'Pause game'} title={mode === 'paused' ? 'Resume' : 'Pause'}>{mode === 'paused' ? '▶' : 'Ⅱ'}<span>{mode === 'paused' ? 'RESUME' : 'PAUSE'}</span></button>
              <button className="utility-button" onClick={restart} aria-label="Restart game" title="Restart">↻<span>RESTART</span></button>
            </div>
          </div>
        </section>

        <section className="lower-bar">
          <div className="control-hint"><span className="key-cap">←</span><span className="key-cap">→</span><span>STEER</span><span className="hint-divider" /><span className="key-cap wide">SPACE</span><span>JUMP</span></div>
          <div className="touch-controls">
            <button className="touch-button brake" onPointerDown={() => setControl('ArrowLeft', true)} onPointerUp={() => setControl('ArrowLeft', false)} onPointerLeave={() => setControl('ArrowLeft', false)}>BRAKE</button>
            <button className="touch-button jump" onPointerDown={() => setControl('Space', true)} onPointerUp={() => setControl('Space', false)} onPointerLeave={() => setControl('Space', false)}>JUMP</button>
            <button className="touch-button drive" onPointerDown={() => setControl('ArrowRight', true)} onPointerUp={() => setControl('ArrowRight', false)} onPointerLeave={() => setControl('ArrowRight', false)}>DRIVE <span>→</span></button>
          </div>
          <div className="club-stamp">RMC <span>·</span> EST. 1987</div>
        </section>
      </main>
      <footer className="page-footer"><span>RIDGELINE MOTOR CLUB</span><span>TAKE THE LONG WAY UP</span></footer>
    </div>
  )
}

export default App
