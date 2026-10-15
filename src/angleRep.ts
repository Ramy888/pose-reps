// Rep detector for exercises that bend to a target angle and straighten again (squats, lunges).
import {LEGS, type Point, visible} from './pose.ts';
import type {Cue, Exercise, ExerciseUpdate, RepRecord} from './types.ts';

export type AngleRepConfig = {
  // Angle to track for this frame; legs are already known to be visible.
  measure: (kp: readonly Point[]) => number;
  downAngle: number; // must go below this for the rep to count
  upAngle: number; // must come back above this to finish the rep
  dipAngle: number; // going below this but not below downAngle is a half rep: cue "deeper"
  minRepMs: number; // faster than this isn't a real rep (jitter, bounce)
  slowRepMs: number; // faster than this counts, but cues "slower"
};

const SMOOTHING = 0.35; // EMA factor for the tracked angle

type Phase = 'up' | 'dipping' | 'down';

export class AngleRepDetector implements Exercise {
  private readonly config: AngleRepConfig;
  private reps = 0;
  private phase: Phase = 'up';
  private smooth: number | null = null;
  private lastRepAt = -Infinity;
  private dipStartedAt = 0;
  private deepest = Infinity;
  private hidden = false;

  constructor(config: AngleRepConfig) {
    this.config = config;
  }

  update(kp: readonly Point[], t: number): ExerciseUpdate {
    if (!visible(kp, LEGS)) {
      this.smooth = null;
      this.phase = 'up';
      const cue: Cue | null = this.hidden ? null : 'step-back';
      this.hidden = true;
      return {reps: this.reps, rep: null, cue, metric: null};
    }
    this.hidden = false;

    const c = this.config;
    const raw = c.measure(kp);
    this.smooth = this.smooth == null ? raw : this.smooth + SMOOTHING * (raw - this.smooth);
    const a = this.smooth;
    let cue: Cue | null = null;
    let rep: RepRecord | null = null;

    if (this.phase === 'up' && a < c.dipAngle) {
      this.phase = 'dipping';
      this.dipStartedAt = t;
      this.deepest = a;
    }
    if (this.phase !== 'up') {
      this.deepest = Math.min(this.deepest, a);
    }
    if (this.phase === 'dipping' && a < c.downAngle) {
      this.phase = 'down';
    }
    if (a > c.upAngle) {
      if (this.phase === 'dipping') {
        cue = 'deeper';
      } else if (this.phase === 'down' && t - this.lastRepAt > c.minRepMs) {
        this.reps++;
        this.lastRepAt = t;
        rep = {durationMs: t - this.dipStartedAt, depth: Math.round(this.deepest)};
        if (t - this.dipStartedAt < c.slowRepMs) {
          cue = 'slower';
        }
      }
      this.phase = 'up';
    }
    return {reps: this.reps, rep, cue, metric: Math.round(a)};
  }
}
