import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  AngleRepDetector,
  J,
  angle,
  createDetector,
  fromLandmarks,
  type Cue,
  type Exercise,
  type ExerciseId,
  type Point,
} from '../src/index.ts';

const create = (id: ExerciseId) => createDetector(id);
const repeat = <T>(x: T, n: number) => Array.from({length: n}, () => x);

function body(visibility = 1): Point[] {
  const kp: Point[] = Array.from({length: 33}, () => [0.5, 0.5, 1] as Point);
  kp[J.leftShoulder] = [0.45, 0.25, 1];
  kp[J.rightShoulder] = [0.55, 0.25, 1];
  kp[J.leftElbow] = [0.45, 0.35, 1];
  kp[J.rightElbow] = [0.55, 0.35, 1];
  kp[J.leftWrist] = [0.45, 0.45, 1];
  kp[J.rightWrist] = [0.55, 0.45, 1];
  for (const [s, dx] of [[0, -0.05], [1, 0.05]]) {
    kp[J.leftHip + s] = [0.5 + dx, 0.45, visibility];
    kp[J.leftKnee + s] = [0.5 + dx, 0.65, visibility];
    kp[J.leftAnkle + s] = [0.5 + dx, 0.85, visibility];
  }
  return kp;
}

// Push knees forward by `left` / `right` to bend them (0 = straight, 0.2 = deep).
function legs(left: number, right = left, visibility = 1): Point[] {
  const kp = body(visibility);
  kp[J.leftKnee] = [kp[J.leftKnee][0] + left, 0.65, visibility];
  kp[J.rightKnee] = [kp[J.rightKnee][0] + right, 0.65, visibility];
  return kp;
}

function jack(open: boolean): Point[] {
  const kp = body();
  const handY = open ? 0.1 : 0.45;
  kp[J.leftWrist] = [0.35, handY, 1];
  kp[J.rightWrist] = [0.65, handY, 1];
  const feet = open ? 0.12 : 0.05;
  kp[J.leftAnkle] = [0.5 - feet, 0.85, 1];
  kp[J.rightAnkle] = [0.5 + feet, 0.85, 1];
  return kp;
}

// Feeds frames 33 ms apart (about 30 fps) and collects every cue fired.
function run(ex: Exercise, frames: Point[][], stepMs = 33, startMs = 0) {
  const cues: Cue[] = [];
  let reps = 0;
  frames.forEach((kp, i) => {
    const u = ex.update(kp, startMs + i * stepMs);
    reps = u.reps;
    if (u.cue) {
      cues.push(u.cue);
    }
  });
  return {reps, cues};
}

const rep = (bend: (d: number) => Point[], depth: number, holdFrames = 40) => [
  ...repeat(bend(0), holdFrames),
  ...repeat(bend(depth), holdFrames),
  ...repeat(bend(0), holdFrames),
];
const squat = (depth: number, hold?: number) => rep((d) => legs(d), depth, hold);
const lunge = (depth: number) => rep((d) => legs(d, 0), depth);

describe('squats', () => {
  it('counts each full squat once, with no cues', () => {
    assert.deepEqual(run(create('squat'), [...squat(0.2), ...squat(0.2), ...squat(0.2)]), {reps: 3, cues: []});
  });

  it('cues "deeper" for a half squat and does not count it', () => {
    assert.deepEqual(run(create('squat'), squat(0.08)), {reps: 0, cues: ['deeper']});
  });

  it('ignores tiny knee bends without cueing', () => {
    assert.deepEqual(run(create('squat'), squat(0.02)), {reps: 0, cues: []});
  });

  it('counts a fast squat but cues "slower"', () => {
    // 4 frames per phase at 33 ms: about 0.4 s from dip to standing.
    assert.deepEqual(run(create('squat'), squat(0.2, 4), 33, 1000), {reps: 1, cues: ['slower']});
  });

  it('does not count a bounce right after a rep', () => {
    const frames = [...squat(0.2), ...repeat(legs(0.2), 3), ...repeat(legs(0), 3)];
    assert.equal(run(create('squat'), frames).reps, 1);
  });

  it('cues "step back" once when legs leave the frame, and counts nothing', () => {
    const hidden = squat(0.2).map(() => legs(0.2, 0.2, 0.2));
    assert.deepEqual(run(create('squat'), hidden), {reps: 0, cues: ['step-back']});
  });

  it('does not count one bent leg as a squat', () => {
    assert.equal(run(create('squat'), lunge(0.2)).reps, 0);
  });
});

describe('per-rep records', () => {
  it('reports duration and the deepest knee angle once per counted squat', () => {
    const ex = create('squat');
    const records = squat(0.2).flatMap((kp, i) => {
      const u = ex.update(kp, i * 33);
      return u.rep ? [u.rep] : [];
    });
    assert.equal(records.length, 1);
    assert.ok(records[0].depth! > 40 && records[0].depth! < 110);
    assert.ok(records[0].durationMs > 1000);
  });

  it('reports no record for a half squat', () => {
    const ex = create('squat');
    assert.equal(squat(0.08).some((kp, i) => ex.update(kp, i * 33).rep), false);
  });
});

describe('lunges', () => {
  it('counts a lunge on either leg', () => {
    const frames = [...lunge(0.2), ...rep((d) => legs(0, d), 0.2)];
    assert.deepEqual(run(create('lunge'), frames), {reps: 2, cues: []});
  });

  it('cues "deeper" for a shallow lunge', () => {
    assert.deepEqual(run(create('lunge'), lunge(0.08)), {reps: 0, cues: ['deeper']});
  });
});

describe('jumping jacks', () => {
  const cycle = [...repeat(jack(false), 6), ...repeat(jack(true), 6), ...repeat(jack(false), 6)];

  it('counts each open-then-closed cycle', () => {
    assert.equal(run(create('jumping-jack'), [...cycle, ...cycle, ...cycle]).reps, 3);
  });

  it('does not count arms alone without the feet going wide', () => {
    const armsOnly = jack(true);
    armsOnly[J.leftAnkle] = [0.45, 0.85, 1];
    armsOnly[J.rightAnkle] = [0.55, 0.85, 1];
    const frames = [...repeat(jack(false), 6), ...repeat(armsOnly, 6), ...repeat(jack(false), 6)];
    assert.equal(run(create('jumping-jack'), frames).reps, 0);
  });
});

describe('custom exercises', () => {
  // A bicep curl: the elbow closes from straight (~180°) to under 60° and opens again.
  // The detector only needs the legs visible, which the test body always has.
  const curl = () =>
    new AngleRepDetector({
      measure: (kp) => angle(kp[J.rightShoulder], kp[J.rightElbow], kp[J.rightWrist]),
      downAngle: 60,
      upAngle: 150,
      dipAngle: 120,
      minRepMs: 600,
      slowRepMs: 800,
    });
  const arm = (closed: number) => {
    const kp = body();
    // Rotate the forearm up toward the shoulder: 0 = straight down, 1 = fully curled.
    const a = Math.PI * closed * 0.85;
    kp[J.rightWrist] = [0.55 + 0.1 * Math.sin(a), 0.35 + 0.1 * Math.cos(a), 1];
    return kp;
  };

  it('counts a full curl with a custom measure', () => {
    assert.deepEqual(run(curl(), rep(arm, 1)), {reps: 1, cues: []});
  });

  it('cues "deeper" for a half curl', () => {
    assert.deepEqual(run(curl(), rep(arm, 0.5)), {reps: 0, cues: ['deeper']});
  });
});

describe('helpers', () => {
  it('converts MediaPipe landmarks, treating a missing visibility as visible', () => {
    assert.deepEqual(fromLandmarks([{x: 0.1, y: 0.2, visibility: 0.3}, {x: 0.4, y: 0.5}]), [
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 1],
    ]);
  });

  it('measures a right angle', () => {
    assert.equal(Math.round(angle([0, 0, 1], [0, 1, 1], [1, 1, 1])), 90);
  });

  it('rejects an unknown exercise id', () => {
    assert.throws(() => createDetector('plank' as ExerciseId), /Unknown exercise: plank/);
  });
});
