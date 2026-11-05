import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { InputState } from '../game/types';

interface TouchControlsProps {
  onButton: (button: keyof InputState, pressed: boolean) => void;
  visible: boolean;
}

type ButtonSpec = {
  id: keyof InputState;
  label: string;
  sub?: string;
  className?: string;
};

const LEFT_PAD: ButtonSpec[] = [
  { id: 'left', label: '\u25C0' },
  { id: 'down', label: '\u25BC' },
  { id: 'right', label: '\u25B6' },
  { id: 'block', label: 'BLK', sub: 'blok', className: 'wide' },
  { id: 'up', label: '\u25B2', sub: 'skok' },
];

const RIGHT_PAD: ButtonSpec[] = [
  { id: 'light', label: 'J', sub: 'lekki' },
  { id: 'heavy', label: 'K', sub: 'ciezki' },
  { id: 'special', label: 'L', sub: 'spec.' },
];

/**
 * Wirtualne przyciski dla urzadzen dotykowych.
 *
 * Uzywamy Pointer Events, zeby obsluzyc palce, rysik i mysz jednym kodem,
 * oraz `setPointerCapture`, aby przycisk nie "gubil" wcisniecia przy zsunieciu
 * palca poza jego obszar.
 */
export const TouchControls = ({ onButton, visible }: TouchControlsProps): ReactElement => {
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const activePointers = useRef<Map<number, keyof InputState>>(new Map());

  const press = useCallback(
    (id: keyof InputState) => {
      setPressed((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      onButton(id, true);
    },
    [onButton],
  );

  const release = useCallback(
    (id: keyof InputState) => {
      setPressed((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      onButton(id, false);
    },
    [onButton],
  );

  useEffect(() => {
    if (visible) return;
    // zwolnij wszystko przy ukryciu panelu, zeby nie zostalo "zablokowane" wejscie
    activePointers.current.forEach((id) => release(id));
    activePointers.current.clear();
  }, [visible, release]);

  const handleDown = (id: keyof InputState) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointers.current.set(e.pointerId, id);
    press(id);
  };

  const handleUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const id = activePointers.current.get(e.pointerId);
    if (!id) return;
    activePointers.current.delete(e.pointerId);
    release(id);
  };

  const renderPad = (specs: ButtonSpec[], side: 'left' | 'right') => (
    <div className={`pad ${side}`}>
      {specs.map((spec) => (
        <button
          key={spec.id}
          type="button"
          className={`tbtn ${spec.className ?? ''} ${pressed.has(spec.id) ? 'pressed' : ''}`}
          onPointerDown={handleDown(spec.id)}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span>
            {spec.label}
            {spec.sub ? <small>{spec.sub}</small> : null}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <div className={`touch-layer ${visible ? 'active' : ''}`} aria-hidden={!visible}>
      {renderPad(LEFT_PAD, 'left')}
      {renderPad(RIGHT_PAD, 'right')}
    </div>
  );
};
