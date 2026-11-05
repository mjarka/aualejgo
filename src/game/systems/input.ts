import type { InputEdges, InputState } from '../types';
import { emptyInput } from '../types';

/** Mapowanie klawiszy gracza (KeyboardEvent.code). */
export const KEY_BINDINGS = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  light: ['KeyJ'],
  heavy: ['KeyK'],
  special: ['KeyL'],
  block: ['Space', 'ShiftLeft', 'ShiftRight'],
} as const;

export const CONTROL_HINTS = [
  { keys: 'A / D', action: 'Ruch' },
  { keys: 'W', action: 'Skok' },
  { keys: 'S', action: 'Kucanie' },
  { keys: 'J', action: 'Cios lekki' },
  { keys: 'K', action: 'Cios ciezki' },
  { keys: 'L', action: 'Atak specjalny' },
  { keys: 'Spacja', action: 'Blok' },
  { keys: 'ESC', action: 'Pauza' },
] as const;

/**
 * Zbiera wejscie z klawiatury, gamepada oraz wirtualnych przyciskow dotykowych.
 *
 * `state` to stan ciagly (trzymanie klawisza), `edges` to jednorazowe
 * wcisniecia wykryte w biezacej klatce.
 */
export class InputManager {
  private keys = new Set<string>();
  private touch = emptyInput();
  private prev = emptyInput();
  private current = emptyInput();
  private edgeState: InputEdges = { up: false, light: false, heavy: false, special: false };
  /**
   * Zatrzaskuje wcisniecia miedzy klatkami.
   *
   * Bez tego bardzo szybkie tapniecie (keydown i keyup w tej samej klatce)
   * zostaloby calkowicie zignorowane, bo stan klawisza zdazylby wrocic do
   * false zanim symulacja zdazylaby go odczytac.
   */
  private latch = new Set<string>();
  private touchLatch = new Set<keyof InputState>();
  private gamepadLatch = new Set<number>();
  private gamepadIndex: number | null = null;
  private attached = false;

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.isBound(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    this.latch.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onBlur = (): void => {
    this.keys.clear();
  };

  private onGamepadConnected = (e: GamepadEvent): void => {
    this.gamepadIndex = e.gamepad.index;
  };

  private onGamepadDisconnected = (e: GamepadEvent): void => {
    if (this.gamepadIndex === e.gamepad.index) this.gamepadIndex = null;
  };

  attach(): void {
    if (this.attached) return;
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('gamepadconnected', this.onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('gamepadconnected', this.onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    this.attached = false;
  }

  /** Ustawia stan wirtualnego przycisku dotykowego. */
  setTouch(button: keyof InputState, pressed: boolean): void {
    this.touch[button] = pressed;
    if (pressed) this.touchLatch.add(button);
  }

  clearTouch(): void {
    this.touch = emptyInput();
    this.touchLatch.clear();
  }

  /** Wywolywane raz na klatke symulacji. */
  update(): void {
    this.prev = this.current;
    const next = emptyInput();
    const any = (codes: readonly string[]): boolean => codes.some((c) => this.keys.has(c));
    const latched = (codes: readonly string[]): boolean =>
      codes.some((c) => this.latch.has(c) || this.keys.has(c));

    next.left = any(KEY_BINDINGS.left) || this.touch.left;
    next.right = any(KEY_BINDINGS.right) || this.touch.right;
    next.up = any(KEY_BINDINGS.up) || this.touch.up;
    next.down = any(KEY_BINDINGS.down) || this.touch.down;
    next.light = latched(KEY_BINDINGS.light) || this.touch.light;
    next.heavy = latched(KEY_BINDINGS.heavy) || this.touch.heavy;
    next.special = latched(KEY_BINDINGS.special) || this.touch.special;
    next.block = any(KEY_BINDINGS.block) || this.touch.block;

    this.applyGamepad(next);
    this.current = next;

    this.edgeState = {
      up: next.up && !this.prev.up,
      light: next.light && !this.prev.light,
      heavy: next.heavy && !this.prev.heavy,
      special: next.special && !this.prev.special,
    };

    this.latch.clear();
    this.touchLatch.clear();
    this.gamepadLatch.clear();
  }

  get state(): InputState {
    return this.current;
  }

  get edges(): InputEdges {
    return this.edgeState;
  }

  private applyGamepad(target: InputState): void {
    const pads = navigator.getGamepads?.() ?? [];
    let pad: Gamepad | null = null;
    if (this.gamepadIndex !== null && pads[this.gamepadIndex]) {
      pad = pads[this.gamepadIndex];
    } else {
      pad = Array.from(pads).find((p): p is Gamepad => !!p) ?? null;
      this.gamepadIndex = pad ? pad.index : null;
    }
    if (!pad) return;

    const axisX = pad.axes[0] ?? 0;
    const axisY = pad.axes[1] ?? 0;
    const dead = 0.35;
    const pressed = (i: number): boolean => {
      const isDown = pad.buttons[i]?.pressed ?? false;
      if (isDown) this.gamepadLatch.add(i);
      return isDown || this.gamepadLatch.has(i);
    };

    target.left = target.left || axisX < -dead || pressed(14);
    target.right = target.right || axisX > dead || pressed(15);
    target.up = target.up || axisY < -dead || pressed(12);
    target.down = target.down || axisY > dead || pressed(13);
    target.light = target.light || pressed(0) || pressed(2);
    target.heavy = target.heavy || pressed(1) || pressed(3);
    target.special = target.special || pressed(5) || pressed(7);
    target.block = target.block || pressed(4) || pressed(6);
  }

  private isBound(code: string): boolean {
    return Object.values(KEY_BINDINGS).some((codes) => (codes as readonly string[]).includes(code));
  }
}
