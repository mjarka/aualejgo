import type { Fighter } from '../entities/fighter';
import type { Projectile } from '../entities/projectile';
import { rectsOverlap } from '../core/math';
import { PROJECTILE } from '../config/balance';
import { METER_PER_HIT_DEALT } from '../constants';

export interface HitEvent {
  kind: 'light' | 'heavy' | 'special' | 'air' | 'projectile';
  blocked: boolean;
  x: number;
  y: number;
  attacker: Fighter;
  defender: Fighter;
  damage: number;
}

/** Sprawdza, czy cios zostal zablokowany (blok + patrzenie w strone atakujacego). */
const isBlocked = (defender: Fighter, attackerX: number, unblockable: boolean): boolean => {
  if (unblockable) return false;
  if (defender.state !== 'block' && defender.blockstun === 0) return false;
  return attackerX >= defender.x ? defender.facing === 1 : defender.facing === -1;
};

/**
 * Rozstrzyga trafienia ciosami wrecz.
 *
 * Kazdy atak moze trafic tylko raz (`attackHasHit`), co zapobiega
 * wielokrotnemu zadaniu obrazen w tej samej klatce aktywnosci.
 */
export const resolveMeleeHits = (a: Fighter, b: Fighter, events: HitEvent[]): void => {
  for (const [attacker, defender] of [
    [a, b],
    [b, a],
  ] as const) {
    const hitbox = attacker.hitbox;
    if (!hitbox || attacker.attackHasHit || !attacker.attack) continue;
    if (defender.isDefeated) continue;
    if (!rectsOverlap(hitbox, defender.hurtbox)) continue;

    const atk = attacker.attack;
    const blocked = isBlocked(defender, attacker.x, atk.unblockable === true);

    attacker.attackHasHit = true;
    defender.receiveHit(
      atk.damage,
      atk.hitstun,
      atk.blockstun,
      atk.knockback,
      atk.hitstop,
      blocked,
      attacker.facing,
    );

    if (blocked) {
      attacker.addMeter(METER_PER_HIT_DEALT * 0.4);
    } else {
      attacker.addMeter(METER_PER_HIT_DEALT);
    }

    events.push({
      kind: attacker.attackKind ?? 'light',
      blocked,
      x: hitbox.x + hitbox.w / 2,
      y: hitbox.y + hitbox.h / 2,
      attacker,
      defender,
      damage: blocked ? 0 : atk.damage,
    });
  }
};

/** Rozstrzyga kolizje pociskow z postaciami oraz pociskow miedzy soba. */
export const resolveProjectileHits = (
  projectiles: Projectile[],
  fighters: readonly Fighter[],
  events: HitEvent[],
): void => {
  for (const proj of projectiles) {
    if (proj.dead) continue;

    for (const target of fighters) {
      if (target.side === proj.owner || target.isDefeated) continue;
      if (!rectsOverlap(proj.box, target.hurtbox)) continue;

      const attacker = fighters.find((f) => f.side === proj.owner);
      if (!attacker) continue;

      const blocked = isBlocked(target, proj.x, false);
      target.receiveHit(
        PROJECTILE.damage,
        PROJECTILE.hitstun,
        PROJECTILE.blockstun,
        PROJECTILE.knockback,
        PROJECTILE.hitstop,
        blocked,
        proj.facing,
      );
      if (!blocked) attacker.addMeter(METER_PER_HIT_DEALT);

      proj.dead = true;
      events.push({
        kind: 'projectile',
        blocked,
        x: proj.x,
        y: proj.y,
        attacker,
        defender: target,
        damage: blocked ? 0 : PROJECTILE.damage,
      });
      break;
    }
  }

  // pociski znosza sie nawzajem
  for (let i = 0; i < projectiles.length; i++) {
    const p1 = projectiles[i];
    if (p1.dead) continue;
    for (let j = i + 1; j < projectiles.length; j++) {
      const p2 = projectiles[j];
      if (p2.dead || p2.owner === p1.owner) continue;
      if (rectsOverlap(p1.box, p2.box)) {
        p1.dead = true;
        p2.dead = true;
        events.push({
          kind: 'projectile',
          blocked: true,
          x: (p1.x + p2.x) / 2,
          y: (p1.y + p2.y) / 2,
          attacker: fighters.find((f) => f.side === p1.owner) ?? fighters[0],
          defender: fighters.find((f) => f.side === p2.owner) ?? fighters[1],
          damage: 0,
        });
        break;
      }
    }
  }
};
