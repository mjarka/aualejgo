import type {
  AnimName,
  AttackDef,
  AttackKind,
  CharacterDef,
  FighterState,
  InputState,
  Side,
} from '../types';
import type { Rect } from '../core/math';
import { clamp } from '../core/math';
import {
  AIR_SPEED,
  GRAVITY,
  GROUND_Y,
  JUMP_VELOCITY,
  MAX_FALL_SPEED,
  MAX_HP,
  MAX_METER,
  METER_PER_HIT_TAKEN,
  STAGE_LEFT,
  STAGE_RIGHT,
  WALK_BACK_SPEED,
  WALK_FORWARD_SPEED,
} from '../constants';
import { ATTACKS } from '../config/balance';
import type { LoadedCharacter } from '../assets/loader';

export interface FighterEvents {
  /** Postac w tej klatce wypuszcza pocisk. */
  spawnProjectile: boolean;
  /** Postac wlasnie rozpoczela atak (do dzwieku). */
  attackStarted: AttackKind | null;
  jumped: boolean;
}

/**
 * Pojedyncza postac: fizyka, maszyna stanow, animacja i pudelka kolizyjne.
 *
 * Wspolrzedne (x, y) to PUNKT STOP - dzieki temu latwo ustawic postac na
 * podlodze i liczyc hitboxy wzgledem podloza.
 */
export class Fighter {
  readonly def: CharacterDef;
  readonly side: Side;
  readonly loaded: LoadedCharacter;

  x: number;
  y = GROUND_Y;
  vx = 0;
  vy = 0;
  /** 1 = patrzy w prawo, -1 = patrzy w lewo. */
  facing: 1 | -1;

  hp = MAX_HP;
  meter = 0;

  state: FighterState = 'idle';
  stateTimer = 0;

  anim: AnimName = 'idle';
  animFrame = 0;
  animTimer = 0;

  attack: AttackDef | null = null;
  attackKind: AttackKind | null = null;
  attackPhase: 'startup' | 'active' | 'recovery' = 'startup';
  attackTimer = 0;
  attackHasHit = false;
  attackElapsed = 0;

  hitstun = 0;
  blockstun = 0;
  hitstop = 0;
  /** Krotkie blysnienie po trafieniu. */
  flash = 0;

  onGround = true;
  crouching = false;
  /** Ustawiane przez atak specjalny; odczytywane i czyszczone przez mecz. */
  pendingProjectile = false;

  private events: FighterEvents = {
    spawnProjectile: false,
    attackStarted: null,
    jumped: false,
  };

  constructor(def: CharacterDef, loaded: LoadedCharacter, side: Side, x: number, facing: 1 | -1) {
    this.def = def;
    this.loaded = loaded;
    this.side = side;
    this.x = x;
    this.facing = facing;
    this.playAnim('idle', true);
  }

  // ---------------------------------------------------------------- pudelka

  get hurtbox(): Rect {
    const h = this.crouching || this.state === 'crouch' ? this.def.bodyH * 0.66 : this.def.bodyH;
    return {
      x: this.x - this.def.bodyW / 2,
      y: this.y - h,
      w: this.def.bodyW,
      h,
    };
  }

  get pushbox(): Rect {
    return {
      x: this.x - this.def.bodyW / 2,
      y: this.y - this.def.bodyH,
      w: this.def.bodyW,
      h: this.def.bodyH,
    };
  }

  /** Aktywny hitbox ataku albo null. */
  get hitbox(): Rect | null {
    if (!this.attack || this.attackPhase !== 'active' || this.attack.projectile) return null;
    const hb = this.attack.hitbox;
    const x = this.facing === 1 ? this.x + hb.x : this.x - hb.x - hb.w;
    return { x, y: this.y + hb.y, w: hb.w, h: hb.h };
  }

  get isAttacking(): boolean {
    return this.attack !== null;
  }

  get canAct(): boolean {
    return (
      this.attack === null &&
      this.hitstun === 0 &&
      this.blockstun === 0 &&
      this.state !== 'knockdown' &&
      this.state !== 'victory' &&
      this.state !== 'defeat'
    );
  }

  get isDefeated(): boolean {
    return this.hp <= 0;
  }

  // ------------------------------------------------------------- animacje

  playAnim(name: AnimName, restart = false): void {
    if (!restart && this.anim === name) return;
    this.anim = name;
    this.animFrame = 0;
    this.animTimer = 0;
  }

  private advanceAnim(dt: number): void {
    const def = this.def.animations[this.anim];
    if (!def) return;
    const frameDuration = 1 / def.fps;
    this.animTimer += dt;
    while (this.animTimer >= frameDuration) {
      this.animTimer -= frameDuration;
      if (this.animFrame + 1 < def.frames) {
        this.animFrame++;
      } else if (def.loop) {
        this.animFrame = 0;
      }
    }
  }

  /** Klatka animacji ataku zsynchronizowana z faza ataku. */
  private syncAttackAnim(): void {
    if (!this.attack) return;
    const total = this.attack.startup + this.attack.active + this.attack.recovery;
    const animDef = this.def.animations[this.attack.anim];
    if (!animDef) return;
    const t = clamp(this.attackElapsed / Math.max(1, total), 0, 1);
    this.animFrame = Math.min(animDef.frames - 1, Math.floor(t * animDef.frames));
  }

  // ---------------------------------------------------------------- akcje

  private startAttack(kind: AttackKind): void {
    const def = ATTACKS[kind];
    if (def.meterCost && this.meter < def.meterCost) return;
    if (def.meterCost) this.meter -= def.meterCost;

    this.attack = def;
    this.attackKind = kind;
    this.attackPhase = 'startup';
    this.attackTimer = 0;
    this.attackElapsed = 0;
    this.attackHasHit = false;
    this.state = 'attack';
    this.stateTimer = 0;
    this.crouching = false;
    this.playAnim(def.anim, true);
    this.events.attackStarted = kind;
  }

  private jump(): void {
    this.vy = JUMP_VELOCITY;
    this.onGround = false;
    this.state = 'jump';
    this.playAnim('jump', true);
    this.events.jumped = true;
  }

  // --------------------------------------------------------------- obrazenia

  /** Zadaje cios. `blocked` decyduje o hitstun/blockstun i odrzucie. */
  receiveHit(
    damage: number,
    hitstun: number,
    blockstun: number,
    knockback: { x: number; y: number },
    hitstop: number,
    blocked: boolean,
    attackerFacing: 1 | -1,
  ): void {
    this.hitstop = hitstop;
    this.flash = blocked ? 4 : 8;

    if (blocked) {
      this.blockstun = blockstun;
      this.state = 'block';
      this.playAnim('block', true);
      this.vx = attackerFacing * knockback.x * 0.35;
      this.meter = clamp(this.meter + 3, 0, MAX_METER);
      return;
    }

    this.hp = Math.max(0, this.hp - damage);
    this.hitstun = hitstun;
    this.attack = null;
    this.attackKind = null;
    this.crouching = false;
    this.meter = clamp(this.meter + METER_PER_HIT_TAKEN, 0, MAX_METER);

    if (this.hp <= 0) {
      this.state = 'knockdown';
      this.stateTimer = 0;
      this.playAnim('knockdown', true);
      this.vx = attackerFacing * Math.max(2.2, knockback.x);
      this.vy = -3.2;
      this.onGround = false;
      return;
    }

    this.state = 'hit';
    this.playAnim('hit', true);
    this.vx = attackerFacing * knockback.x;
    if (knockback.y !== 0) {
      this.vy = knockback.y;
      this.onGround = false;
    }
  }

  /** Odrzut bez obrazen (np. po zablokowaniu pocisku). */
  addMeter(amount: number): void {
    this.meter = clamp(this.meter + amount, 0, MAX_METER);
  }

  // ------------------------------------------------------------- aktualizacja

  update(dt: number, input: InputState, edges: { up: boolean; light: boolean; heavy: boolean; special: boolean }, opponentX: number): void {
    this.events.spawnProjectile = false;
    this.events.attackStarted = null;
    this.events.jumped = false;

    if (this.flash > 0) this.flash--;

    // hitstop zamraza wszystko oprocz licznika
    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }

    // Postac zawsze patrzy na przeciwnika - takze w powietrzu, dzieki czemu
    // po przeskoczeniu nad nim obraca sie w locie. W trakcie ataku, hitstunu
    // i nokdaunu `canAct` jest false, wiec obrot pozostaje zablokowany.
    if (this.canAct && opponentX !== this.x) {
      this.facing = opponentX > this.x ? 1 : -1;
    }

    // animacje koncowe nie moga zostac nadpisane przez logike ruchu
    if (this.state === 'victory' || this.state === 'defeat') {
      this.applyPhysics();
      this.advanceAnim(dt);
      return;
    }

    if (this.state === 'knockdown') {
      this.updateKnockdown();
      this.advanceAnim(dt);
      return;
    }

    if (this.hitstun > 0) {
      this.hitstun--;
      this.applyPhysics();
      if (this.hitstun === 0 && this.state === 'hit') {
        this.state = 'idle';
        this.playAnim('idle', true);
      }
      this.advanceAnim(dt);
      return;
    }

    if (this.blockstun > 0) {
      this.blockstun--;
      this.applyPhysics();
      if (this.blockstun === 0) {
        this.state = 'idle';
        this.playAnim('idle', true);
      }
      this.advanceAnim(dt);
      return;
    }

    if (this.attack) {
      this.updateAttack();
      this.advanceAnim(dt);
      return;
    }

    if (!this.onGround) {
      this.updateAir(input, edges);
      this.advanceAnim(dt);
      return;
    }

    this.updateGround(input, edges);
    this.advanceAnim(dt);
  }

  private updateGround(
    input: InputState,
    edges: { up: boolean; light: boolean; heavy: boolean; special: boolean },
  ): void {
    if (edges.light) {
      this.startAttack('light');
      return;
    }
    if (edges.heavy) {
      this.startAttack('heavy');
      return;
    }
    if (edges.special) {
      this.startAttack('special');
      return;
    }

    if (input.block) {
      this.state = 'block';
      this.crouching = false;
      this.vx = 0;
      this.playAnim('block');
      return;
    }

    if (input.down) {
      this.state = 'crouch';
      this.crouching = true;
      this.vx = 0;
      this.playAnim('crouch');
      return;
    }

    this.crouching = false;

    if (edges.up) {
      this.jump();
      return;
    }

    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) {
      const forward = dir === this.facing;
      const speed = forward ? WALK_FORWARD_SPEED : WALK_BACK_SPEED;
      this.x += dir * speed;
      this.state = forward ? 'walkForward' : 'walkBack';
      this.playAnim(forward ? 'walkForward' : 'walkBack');
    } else {
      this.state = 'idle';
      this.playAnim('idle');
    }
    this.vx = 0;
    this.clampToStage();
  }

  private updateAir(input: InputState, edges: { light: boolean; heavy: boolean }): void {
    this.crouching = false;

    // cios w powietrzu - kopniecie, ktore przerywa lot
    if (edges.light || edges.heavy) {
      this.startAttack('air');
      return;
    }

    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) this.x += dir * AIR_SPEED;
    this.state = 'jump';
    this.playAnim('jump');
    this.applyPhysics();
  }

  private updateAttack(): void {
    const atk = this.attack;
    if (!atk) return;

    this.attackTimer++;
    this.attackElapsed++;

    const { startup, active, recovery } = atk;

    if (this.attackTimer <= startup) {
      this.attackPhase = 'startup';
    } else if (this.attackTimer <= startup + active) {
      if (this.attackPhase !== 'active') {
        this.attackPhase = 'active';
        if (atk.projectile) this.pendingProjectile = true;
      }
    } else if (this.attackTimer <= startup + active + recovery) {
      this.attackPhase = 'recovery';
    } else {
      this.attack = null;
      this.attackKind = null;
      // Atak w powietrzu konczy sie czesto przed ladowaniem - wtedy wracamy do
      // animacji skoku, a nie do bezruchu, bo postac nadal jest w locie.
      if (this.onGround) {
        this.state = 'idle';
        this.playAnim('idle', true);
      } else {
        this.state = 'jump';
        this.playAnim('jump', true);
      }
      return;
    }

    // lekki doskok przy ciosie wykonywanym na ziemi
    if (this.onGround && this.attackPhase !== 'recovery') {
      this.x += this.facing * 0.35;
      this.clampToStage();
    }

    this.syncAttackAnim();
    this.applyPhysics();
  }

  private updateKnockdown(): void {
    this.stateTimer++;
    this.applyPhysics();
    if (this.onGround && this.stateTimer > 60 && this.hp > 0) {
      this.state = 'idle';
      this.playAnim('idle', true);
    }
  }

  private applyPhysics(): void {
    if (!this.onGround) {
      this.vy = Math.min(MAX_FALL_SPEED, this.vy + GRAVITY);
      this.y += this.vy;
      if (this.y >= GROUND_Y) {
        this.y = GROUND_Y;
        this.vy = 0;
        this.onGround = true;
        if (this.state === 'jump') {
          this.state = 'idle';
          this.playAnim('idle', true);
        }
      }
    }

    if (this.onGround) {
      this.x += this.vx;
      this.vx *= 0.78;
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
    } else {
      this.x += this.vx;
    }
    this.clampToStage();
  }

  private clampToStage(): void {
    this.x = clamp(this.x, STAGE_LEFT, STAGE_RIGHT);
  }

  /**
   * Rozdziela nachodzace na siebie postacie (pushbox).
   *
   * Pushbox dziala tylko wtedy, gdy OBIE postacie stoja na ziemi. Gdy choc
   * jedna jest w powietrzu, sylwetki sie nie odpychaja - inaczej skok nad
   * przeciwnikiem bylby niemozliwy, bo pushbox wypychalby skaczacego na bok.
   */
  static separate(a: Fighter, b: Fighter, minDistance: number): void {
    if (!a.onGround || !b.onGround) return;
    const dx = b.x - a.x;
    const dist = Math.abs(dx);
    if (dist >= minDistance) return;
    const overlap = minDistance - dist;
    const dir = dx >= 0 ? 1 : -1;
    a.x -= (dir * overlap) / 2;
    b.x += (dir * overlap) / 2;
    a.clampToStage();
    b.clampToStage();
  }

  /** Ustawia animacje zwyciestwa lub porazki na koniec rundy. */
  setOutcome(won: boolean): void {
    this.attack = null;
    this.attackKind = null;
    this.hitstun = 0;
    this.blockstun = 0;
    this.vx = 0;
    this.crouching = false;
    this.onGround = true;
    this.y = GROUND_Y;
    if (won) {
      this.state = 'victory';
      this.playAnim('victory', true);
      return;
    }
    // Po nokdaunie przegrany zostaje na ziemi - wstawanie po K.O. wygladaloby
    // jak nic sie nie stalo. Poza stojaca jest tylko dla przegranej na czas.
    if (this.state !== 'knockdown') {
      this.state = 'defeat';
      this.playAnim('defeat', true);
    }
  }

  resetForRound(x: number, facing: 1 | -1): void {
    this.x = x;
    this.y = GROUND_Y;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    this.hp = MAX_HP;
    this.state = 'idle';
    this.stateTimer = 0;
    this.attack = null;
    this.attackKind = null;
    this.attackHasHit = false;
    this.hitstun = 0;
    this.blockstun = 0;
    this.hitstop = 0;
    this.flash = 0;
    this.onGround = true;
    this.crouching = false;
    this.pendingProjectile = false;
    this.playAnim('idle', true);
  }

  /** Zdarzenia wygenerowane w ostatniej klatce. */
  get lastEvents(): Readonly<FighterEvents> {
    return this.events;
  }
}
