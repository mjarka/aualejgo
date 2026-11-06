import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { CharacterDef, CharacterId } from '../game/types';
import type { DifficultyKey } from '../game/config/balance';
import { DEFAULT_DIFFICULTY } from '../game/config/balance';
import { CONTROL_HINTS } from '../game/systems/input';
import { imageSize } from '../game/core/image';

export interface SelectResult {
  player: CharacterId;
  bot: CharacterId;
  difficulty: DifficultyKey;
}

interface CharacterSelectProps {
  characters: readonly CharacterDef[];
  /** Portrety wczytane przez loader (klucz = id postaci). */
  portraits: Record<string, CanvasImageSource>;
  onConfirm: (result: SelectResult) => void;
  muted: boolean;
  onToggleMute: () => void;
}

/** Rysuje portret w pixel-artowym stylu, zachowujac ostre piksele. */
const PortraitCanvas = ({
  image,
  highlight,
  label,
  onClick,
  disabled,
}: {
  image: CanvasImageSource | undefined;
  highlight: boolean;
  label: string;
  onClick: () => void;
  disabled: boolean;
}): ReactElement => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const srcW = imageSize(image).w;
    const srcH = imageSize(image).h;
    if (!srcW || !srcH) return;

    // wypelnij cala szerokosc, przytnij nadmiar wysokosci od gory
    const scale = canvas.width / srcW;
    const drawH = srcH * scale;
    ctx.drawImage(image, 0, 0, srcW, srcH, 0, canvas.height - drawH, canvas.width, drawH);
  }, [image]);

  return (
    <button
      type="button"
      className={`portrait-card ${highlight ? 'selected' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={highlight}
    >
      <canvas ref={ref} width={200} height={300} className="portrait-canvas" />
      <span className="portrait-name">{label}</span>
    </button>
  );
};

/**
 * Pierwszy ekran gry - wybor postaci gracza.
 *
 * Bot dostaje druga postac, wiec przy dwoch postaciach wybor gracza wybiera
 * oba sloty naraz i nie trzeba pytac osobno o kazdego z nich.
 */
export const CharacterSelect = ({
  characters,
  portraits,
  onConfirm,
  muted,
  onToggleMute,
}: CharacterSelectProps): ReactElement => {
  const [playerId, setPlayerId] = useState<CharacterId>(characters[0]?.id ?? 'c1');
  const [botId, setBotId] = useState<CharacterId>(characters[1]?.id ?? 'c2');

  /** Wybor gracza ustawia tez bota na druga postac - nigdy nie gra sam ze soba. */
  const selectCharacter = (id: CharacterId): void => {
    setPlayerId(id);
    const other = characters.find((c) => c.id !== id);
    if (other) setBotId(other.id);
  };

  return (
    <div className="select-screen">
      <header className="select-header">
        <h1>WYBIERZ POSTAC</h1>
        <p className="select-hint">Kliknij postac, ktora chcesz grac. Przeciwnika wybiera gra.</p>
      </header>

      <div className="portrait-row">
        {characters.map((c) => (
          <PortraitCanvas
            key={c.id}
            image={portraits[c.id]}
            highlight={c.id === playerId}
            label={c.name}
            onClick={() => selectCharacter(c.id)}
            disabled={false}
          />
        ))}
      </div>

      <div className="select-footer">
        <button
          type="button"
          className="btn primary btn-fight"
          onClick={() =>
            onConfirm({ player: playerId, bot: botId, difficulty: DEFAULT_DIFFICULTY })
          }
        >
          Walcz
        </button>
        <button type="button" className="btn btn-sound" onClick={onToggleMute}>
          {muted ? 'Dzwiek: off' : 'Dzwiek: on'}
        </button>
      </div>

      <details className="controls-details">
        <summary>Sterowanie</summary>
        <div className="controls-grid">
          {CONTROL_HINTS.map((hint) => (
            <div key={hint.keys}>
              <span className="key">{hint.keys}</span>
              <span className="act">{hint.action}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
};
