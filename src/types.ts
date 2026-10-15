import type {Point} from './pose.ts';

// A coaching cue fires once, on the frame where the problem is detected.
export type Cue = 'deeper' | 'slower' | 'step-back';

// Reported once, on the frame where a rep completes.
export type RepRecord = {
  durationMs: number; // start of the movement to the end of the rep
  depth: number | null; // deepest tracked angle in degrees (lower is deeper); null if not angle-based
};

export type ExerciseUpdate = {
  reps: number;
  rep: RepRecord | null;
  cue: Cue | null;
  // Angle or measure to show on screen, or null when the body isn't fully visible.
  metric: number | null;
};

export interface Exercise {
  // Feed one pose frame. `capturedAtMs` must increase between calls (any clock works).
  update(kp: readonly Point[], capturedAtMs: number): ExerciseUpdate;
}

export const CUE_TEXT: Record<Cue, string> = {
  deeper: 'Go deeper',
  slower: 'Slow down',
  'step-back': 'Step back: full body in frame',
};
