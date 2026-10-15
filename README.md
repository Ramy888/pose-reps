# pose-reps

**Count exercise reps and coach form from MediaPipe pose keypoints.** Squats, lunges and jumping jacks out of the box, or any exercise that bends a joint to a target angle and back. Zero dependencies, about 300 lines of TypeScript, and it runs anywhere JavaScript does: the browser, Node, or React Native.

```ts
import {createDetector, fromLandmarks, CUE_TEXT} from 'pose-reps';

const squats = createDetector('squat');

// In your camera loop, after MediaPipe's PoseLandmarker:
const u = squats.update(fromLandmarks(result.landmarks[0]), performance.now());
u.reps;                   // 3
u.cue && CUE_TEXT[u.cue]; // "Go deeper"
u.rep;                    // {durationMs: 1840, depth: 92}, on the frame a rep completes
```

It was extracted from [Spotter](https://www.amazon.com/dp/B0HLY8788C), an AI form coach for Fire TV, where it counts reps live from a phone's camera.

## Why

A rep counter is easy until real people use it. Bodies wobble, people do half reps, step out of frame, and bounce at the bottom. pose-reps handles those cases so you don't have to:

- **Only full reps count.** A squat has to go below the depth target and come back up. A half rep isn't counted, and it fires a `deeper` cue instead.
- **No double counts.** The tracked angle is smoothed, and a minimum rep time ignores jitter and bounces at the bottom.
- **Coaching cues fire once, on the frame the problem happens:** `deeper` (half rep), `slower` (rushed rep), and `step-back` (the joints it needs aren't visible).
- **Per-rep records** for summaries and progress: how long each rep took and how deep it went.
- **Squats can't be cheated with one leg.** The squat tracks the *straighter* knee, so shifting your weight onto one leg doesn't count. The lunge tracks the *more bent* knee, so either leg works.

## Install

Until it's published to npm, install from GitHub:

```sh
npm install github:Ramy888/pose-reps
```

## Usage

### With MediaPipe Tasks in the browser

```ts
import {PoseLandmarker, FilesetResolver} from '@mediapipe/tasks-vision';
import {createDetector, fromLandmarks, CUE_TEXT} from 'pose-reps';

const files = await FilesetResolver.forVisionTasks(
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
);
const landmarker = await PoseLandmarker.createFromOptions(files, {
  baseOptions: {modelAssetPath: 'pose_landmarker_lite.task'},
  runningMode: 'VIDEO',
  numPoses: 1,
});

const detector = createDetector('squat');

function onFrame(video: HTMLVideoElement) {
  const now = performance.now();
  const pose = landmarker.detectForVideo(video, now).landmarks[0];
  if (pose) {
    const u = detector.update(fromLandmarks(pose), now);
    showCount(u.reps);
    if (u.cue) showCue(CUE_TEXT[u.cue]);
  }
  requestAnimationFrame(() => onFrame(video));
}
```

A complete page is in [`examples/browser/index.html`](examples/browser/index.html). Run `npm install` (which builds `dist/`), serve the repo folder with any static server, and open `/examples/browser/`.

### Keypoints from anywhere else

Detectors take `[x, y, visibility]` triples in MediaPipe's 33-landmark order, with `x` and `y` normalized to 0..1 and `y` growing downward. If your keypoints come from another source, such as a server or a phone streaming to a TV like Spotter does, map them to that shape and pass any increasing timestamp in milliseconds:

```ts
detector.update(keypoints, capturedAtMs);
```

The timestamp should be when the frame was **captured**, not when it arrived. Then network jitter can't make a rep look faster or slower than it was.

### Your own exercise

`AngleRepDetector` works for any movement that bends a joint past a target and straightens it again. Here's a bicep curl on the right elbow:

```ts
import {AngleRepDetector, J, angle} from 'pose-reps';

const curls = new AngleRepDetector({
  measure: (kp) => angle(kp[J.rightShoulder], kp[J.rightElbow], kp[J.rightWrist]),
  downAngle: 60,  // must close below this to count
  upAngle: 150,   // must open above this to finish the rep
  dipAngle: 120,  // closing past this but not past downAngle is a half rep: "deeper"
  minRepMs: 600,  // faster than this is jitter, not a rep
  slowRepMs: 800, // faster than this counts, but cues "slower"
});
```

Note that `AngleRepDetector` checks that the **legs** are visible before measuring anything (that's what squats and lunges need). For an upper-body exercise, keep the full body in frame.

## API

| Export | What it is |
|---|---|
| `createDetector(id)` | A fresh detector for `'squat'`, `'lunge'` or `'jumping-jack'`. Detectors hold the rep count, so keep one per player and set. |
| `EXERCISES` | The three built-in exercises, with display names, units, metric labels and depth targets. |
| `detector.update(kp, ms)` | Feed one frame. Returns `{reps, rep, cue, metric}`. `rep` and `cue` are set only on the frame they happen. `metric` is the smoothed angle (or the foot spread for jumping jacks), or `null` when the body isn't visible. |
| `AngleRepDetector` | The engine behind squats and lunges, configurable for any angle-based exercise. |
| `JumpingJackDetector` | Hands up and feet wide, then hands down and feet together, counts one rep. |
| `fromLandmarks(landmarks)` | Converts MediaPipe `{x, y, visibility}` landmarks to `[x, y, visibility]`. |
| `angle(a, b, c)`, `kneeAngles(kp)` | Joint angles in degrees: 180 is straight, smaller is more bent. |
| `J`, `LEGS`, `visible(kp, joints)`, `MIN_VISIBILITY` | Landmark indices and the visibility check (0.6, below which MediaPipe is guessing). |
| `CUE_TEXT` | Default English text for each cue. |

## How it works

Each frame, the detector smooths the tracked angle (an exponential moving average, factor 0.35) and moves through three phases:

```
 up ──(angle < dipAngle)──▶ dipping ──(angle < downAngle)──▶ down
  ▲                            │                               │
  │      (angle > upAngle)     │       (angle > upAngle)       │
  ├────── cue "deeper" ◀───────┘   count rep, maybe "slower" ◀─┘
```

If the needed joints drop below 60% visibility, the detector resets to `up`, fires `step-back` once, and reports `metric: null` until the body is back.

The thresholds in `EXERCISES` are the ones Spotter ships with, tuned on real squats from a phone about 3 m away:

| | depth target | up | half-rep line | min rep | "slower" under |
|---|---|---|---|---|---|
| Squat (straighter knee) | 110° | 155° | 145° | 0.8 s | 1.0 s |
| Lunge (more bent knee) | 105° | 155° | 140° | 0.8 s | 1.0 s |

## Development

```sh
npm install      # also builds dist/
npm test         # node --test, no extra test runner
npm run example  # a squat detector on synthetic keypoints
```

Node 22.6 or newer runs the TypeScript sources and tests directly.

## License

MIT © 2026 Ramy Magdy
