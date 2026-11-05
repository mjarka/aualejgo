import type { ReactElement } from 'react';
import type { GameSnapshot } from '../game/types';

interface PauseOverlayProps {
  snapshot: GameSnapshot;
  difficultyLabel: string;
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
  onToggleMute: () => void;
  muted: boolean;
}

/** Nakladka pauzy (ESC). */
export const PauseOverlay = ({
  snapshot,
  difficultyLabel,
  onResume,
  onRestart,
  onMenu,
  onToggleMute,
  muted,
}: PauseOverlayProps): ReactElement => (
  <div className="overlay">
    <h2>PAUZA</h2>
    <p className="result-line">
      Runda {snapshot.round} &middot; Ty {snapshot.wins.player} : {snapshot.wins.bot} Bot &middot;{' '}
      {difficultyLabel}
    </p>
    <div className="btn-row">
      <button type="button" className="btn primary" onClick={onResume}>
        Wznow
      </button>
      <button type="button" className="btn" onClick={onRestart}>
        Od nowa
      </button>
      <button type="button" className="btn" onClick={onToggleMute}>
        {muted ? 'Dzwiek: off' : 'Dzwiek: on'}
      </button>
      <button type="button" className="btn" onClick={onMenu}>
        Menu
      </button>
    </div>
  </div>
);

interface ResultOverlayProps {
  snapshot: GameSnapshot;
  difficultyLabel: string;
  onRematch: () => void;
  onMenu: () => void;
}

/** Ekran konca walki. */
export const ResultOverlay = ({
  snapshot,
  difficultyLabel,
  onRematch,
  onMenu,
}: ResultOverlayProps): ReactElement => {
  const won = snapshot.winner === 'player';
  return (
    <div className="overlay">
      <h2>{won ? 'ZWYCIESTWO' : 'PORAZKA'}</h2>
      <p className="result-line">
        Ty {snapshot.wins.player} : {snapshot.wins.bot} Bot &middot; {difficultyLabel}
      </p>
      <div className="btn-row">
        <button type="button" className="btn primary" onClick={onRematch}>
          Rewanż
        </button>
        <button type="button" className="btn" onClick={onMenu}>
          Menu
        </button>
      </div>
    </div>
  );
};

interface LoadingOverlayProps {
  progress: number;
  label: string;
}

export const LoadingOverlay = ({ progress, label }: LoadingOverlayProps): ReactElement => (
  <div className="overlay">
    <h2>WCZYTYWANIE</h2>
    <div className="loading">
      <div className="bar">
        <i style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <span className="label">{label}</span>
    </div>
  </div>
);
