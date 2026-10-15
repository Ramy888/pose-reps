// Jumping jacks: a rep is "open" (hands above shoulders, feet wide) followed by "closed"
// (hands below shoulders, feet together).
import {J, type Point, visible} from './pose.ts';
import type {Cue, Exercise, ExerciseUpdate, RepRecord} from './types.ts';

const NEEDED = [
  J.leftShoulder, J.rightShoulder, J.leftWrist, J.rightWrist,
  J.leftHip, J.rightHip, J.leftAnkle, J.rightAnkle,
];
const OPEN_SPREAD = 1.6; // ankle distance / hip width when the feet are apart
const CLOSED_SPREAD = 1.2;
const MIN_REP_MS = 400;

export class JumpingJackDetector implements Exercise {
  private reps = 0;
  private open = false;
  private lastRepAt = -Infinity;
  private openedAt = 0;
  private hidden = false;

  update(kp: readonly Point[], t: number): ExerciseUpdate {
    if (!visible(kp, NEEDED)) {
      const cue: Cue | null = this.hidden ? null : 'step-back';
      this.hidden = true;
      this.open = false;
      return {reps: this.reps, rep: null, cue, metric: null};
    }
    this.hidden = false;

    const hipWidth = Math.abs(kp[J.leftHip][0] - kp[J.rightHip][0]) || 1e-6;
    const spread = Math.abs(kp[J.leftAnkle][0] - kp[J.rightAnkle][0]) / hipWidth;
    const shoulderY = (kp[J.leftShoulder][1] + kp[J.rightShoulder][1]) / 2;
    const handsUp = kp[J.leftWrist][1] < shoulderY && kp[J.rightWrist][1] < shoulderY;
    const handsDown = kp[J.leftWrist][1] > shoulderY && kp[J.rightWrist][1] > shoulderY;

    let rep: RepRecord | null = null;
    if (!this.open && handsUp && spread > OPEN_SPREAD) {
      this.open = true;
      this.openedAt = t;
    } else if (this.open && handsDown && spread < CLOSED_SPREAD) {
      this.open = false;
      if (t - this.lastRepAt > MIN_REP_MS) {
        this.reps++;
        this.lastRepAt = t;
        rep = {durationMs: t - this.openedAt, depth: null};
      }
    }
    return {reps: this.reps, rep, cue: null, metric: Math.round(spread * 10) / 10};
  }
}
