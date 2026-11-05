import type { Rect } from '../core/math';
import { PROJECTILE } from '../config/balance';
import type { Side } from '../types';

/** Pocisk wystrzelony atakiem specjalnym. */
export class Projectile {
  x: number;
  y: number;
  vx: number;
  life = PROJECTILE.life;
  dead = false;
  readonly owner: Side;
  readonly facing: 1 | -1;
  animTimer = 0;

  constructor(owner: Side, x: number, y: number, facing: 1 | -1) {
    this.owner = owner;
    this.x = x;
    this.y = y;
    this.facing = facing;
    this.vx = facing * PROJECTILE.speed;
  }

  get box(): Rect {
    const r = PROJECTILE.radius;
    return { x: this.x - r, y: this.y - r, w: r * 2, h: r * 2 };
  }

  update(): void {
    this.x += this.vx;
    this.animTimer++;
    this.life--;
    if (this.life <= 0) this.dead = true;
  }
}
