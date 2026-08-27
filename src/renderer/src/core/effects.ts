/** Canvas 粒子特效：爱心 / 怒气 / 汗滴 / 星光 / 水滴 / Zzz / 泪滴（情绪与事件的可视化反馈） */
export type EffectKind = 'heart' | 'anger' | 'sweat' | 'sparkle' | 'water' | 'zzz' | 'tear'

interface Particle {
  kind: EffectKind
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
}

export class Effects {
  private particles: Particle[] = []

  spawn(kind: EffectKind, x: number, y: number, count = 5): void {
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 60
      this.particles.push({
        kind,
        x: x + spread,
        y: y + (Math.random() - 0.5) * 20,
        vx: spread * 0.01,
        vy: kind === 'water' || kind === 'sweat' || kind === 'tear' ? 0.6 + Math.random() * 0.4 : -(0.5 + Math.random() * 0.7),
        life: 0,
        maxLife: kind === 'zzz' ? 2200 + Math.random() * 800 : 1200 + Math.random() * 800,
        size: 6 + Math.random() * 6
      })
    }
  }

  update(dtMs: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dtMs * 0.06
      p.y += p.vy * dtMs * 0.06
      p.life += dtMs
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife)
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const alpha = Math.max(0, 1 - p.life / p.maxLife)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(p.x, p.y)
      const s = p.size
      switch (p.kind) {
        case 'heart':
          ctx.fillStyle = '#f26d8d'
          ctx.beginPath()
          ctx.moveTo(0, s * 0.35)
          ctx.bezierCurveTo(-s, -s * 0.45, -s * 0.4, -s, 0, -s * 0.35)
          ctx.bezierCurveTo(s * 0.4, -s, s, -s * 0.45, 0, s * 0.35)
          ctx.fill()
          break
        case 'anger':
          ctx.strokeStyle = '#e04b44'
          ctx.lineWidth = 2
          for (let k = 0; k < 4; k++) {
            const a = (k * Math.PI) / 2 + Math.PI / 4
            ctx.beginPath()
            ctx.moveTo(Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3)
            ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s)
            ctx.stroke()
          }
          ctx.beginPath()
          ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2)
          ctx.stroke()
          break
        case 'sweat':
          ctx.fillStyle = '#6fb7e8'
          ctx.beginPath()
          ctx.moveTo(0, -s)
          ctx.quadraticCurveTo(s * 0.8, 0, 0, s * 0.7)
          ctx.quadraticCurveTo(-s * 0.8, 0, 0, -s)
          ctx.fill()
          break
        case 'sparkle':
          ctx.strokeStyle = '#f5c542'
          ctx.lineWidth = 1.6
          ctx.beginPath()
          ctx.moveTo(-s, 0)
          ctx.lineTo(s, 0)
          ctx.moveTo(0, -s)
          ctx.lineTo(0, s)
          ctx.stroke()
          break
        case 'water':
          ctx.fillStyle = 'rgba(90,160,230,0.9)'
          ctx.beginPath()
          ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2)
          ctx.fill()
          break
        case 'zzz':
          ctx.fillStyle = 'rgba(120,130,180,0.9)'
          ctx.font = `bold ${Math.round(s * 1.6)}px sans-serif`
          ctx.textBaseline = 'middle'
          ctx.fillText('Z', 0, 0)
          break
        case 'tear':
          ctx.fillStyle = 'rgba(140,180,235,0.9)'
          ctx.beginPath()
          ctx.moveTo(0, -s * 0.8)
          ctx.quadraticCurveTo(s * 0.55, 0, 0, s * 0.55)
          ctx.quadraticCurveTo(-s * 0.55, 0, 0, -s * 0.8)
          ctx.fill()
          break
      }
      ctx.restore()
    }
  }
}
