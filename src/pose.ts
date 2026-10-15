// Shared helpers for MediaPipe pose keypoints: [x, y, visibility], x/y normalized to 0..1, y grows downward.

export type Point = [number, number, number];

// MediaPipe Pose landmark indices used by the detectors (BlazePose, 33 landmarks).
export const J = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export const LEGS = [J.leftHip, J.rightHip, J.leftKnee, J.rightKnee, J.leftAnkle, J.rightAnkle];

// Below this, MediaPipe is guessing where the joint is (often off-frame).
export const MIN_VISIBILITY = 0.6;

// A landmark as MediaPipe Tasks (`PoseLandmarker`) and the legacy Pose solution return it.
export type Landmark = {x: number; y: number; visibility?: number};

// Converts MediaPipe landmarks to the compact [x, y, visibility] form the detectors take.
// A missing visibility counts as fully visible.
export function fromLandmarks(landmarks: readonly Landmark[]): Point[] {
  return landmarks.map((l) => [l.x, l.y, l.visibility ?? 1]);
}

export function visible(kp: readonly Point[], joints: readonly number[]): boolean {
  return joints.every((i) => (kp[i]?.[2] ?? 0) >= MIN_VISIBILITY);
}

// Angle at b, in degrees, formed by a-b-c.
export function angle(a: Point, b: Point, c: Point): number {
  const ab = [a[0] - b[0], a[1] - b[1]];
  const cb = [c[0] - b[0], c[1] - b[1]];
  const cos =
    (ab[0] * cb[0] + ab[1] * cb[1]) / (Math.hypot(ab[0], ab[1]) * Math.hypot(cb[0], cb[1]));
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

// [left, right] knee angles: 180 is a straight leg, smaller is more bent.
export function kneeAngles(kp: readonly Point[]): [number, number] {
  return [
    angle(kp[J.leftHip], kp[J.leftKnee], kp[J.leftAnkle]),
    angle(kp[J.rightHip], kp[J.rightKnee], kp[J.rightAnkle]),
  ];
}
