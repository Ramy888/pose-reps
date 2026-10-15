// Runs a squat detector on synthetic keypoints, the way a camera loop would feed it.
// Run with: npm run example
import {CUE_TEXT, J, createDetector, type Point} from '../../src/index.ts';

// A standing body; `bend` pushes both knees forward (0 = straight, 0.2 = a deep squat).
function frame(bend: number): Point[] {
  const kp: Point[] = Array.from({length: 33}, () => [0.5, 0.5, 1] as Point);
  for (const [side, dx] of [[0, -0.05], [1, 0.05]]) {
    kp[J.leftHip + side] = [0.5 + dx, 0.45, 1];
    kp[J.leftKnee + side] = [0.5 + dx + bend, 0.65, 1];
    kp[J.leftAnkle + side] = [0.5 + dx, 0.85, 1];
  }
  return kp;
}

// Three squats: a full one, a half one, and another full one. 30 frames a second.
const depths = [0.2, 0.08, 0.2];
const frames = depths.flatMap((d) => [
  ...Array(30).fill(frame(0)),
  ...Array(30).fill(frame(d)),
  ...Array(30).fill(frame(0)),
]);

const squats = createDetector('squat');
frames.forEach((kp, i) => {
  const u = squats.update(kp, i * 33);
  if (u.rep) {
    console.log(`Rep ${u.reps}: ${u.rep.durationMs} ms, deepest knee angle ${u.rep.depth}°`);
  }
  if (u.cue) {
    console.log(`Cue: ${CUE_TEXT[u.cue]}`);
  }
});
