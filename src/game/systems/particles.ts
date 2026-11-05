import { rand } from '../core/math';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
}

/** Krotkie efekty czasteczkowe: iskry przy trafieniu, kurz przy upadku. */
export class ParticleSystem {
  private particles: Particle[] = [];

  spawnImpact(x: number, y: number, color: string, count = 8, power = 1): void {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(0.6, 2.6) * power;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.6,
        life: 0,
        maxLife: Math.round(rand(12, 24)),
        size: Math.random() < 0.4 ? 2 : 1,
        color,
        gravity: 0.12,
      });
    }
  }

  spawnDust(x: number, y: number, count = 5): void {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + rand(-6, 6),
        y,
        vx: rand(-0.7, 0.7),
        vy: rand(-1.1, -0.3),
        life: 0,
        maxLife: Math.round(rand(14, 26)),
        size: 2,
        color: '#6b5f7a',
        gravity: 0.04,
      });
    }
  }

  update(): void {
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= 0.96;
      p.life++;
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife);
  }

  clear(): void {
    this.particles = [];
  }

  forEach(cb: (x: number, y: number, size: number, color: string, alpha: number) => void): void {
    for (const p of this.particles) {
      const alpha = 1 - p.life / p.maxLife;
      cb(p.x, p.y, p.size, p.color, alpha);
    }
  }
}
