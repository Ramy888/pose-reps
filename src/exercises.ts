// Ready-made detectors for squats, lunges and jumping jacks, with the thresholds Spotter ships with.
import {AngleRepDetector} from './angleRep.ts';
import {JumpingJackDetector} from './jumpingJack.ts';
import {kneeAngles} from './pose.ts';
import type {Exercise} from './types.ts';

export type ExerciseId = 'squat' | 'lunge' | 'jumping-jack';

export type ExerciseDef = {
  id: ExerciseId;
  name: string;
  unit: string; // plural noun under the rep count
  metricLabel: string;
  depthTarget: number; // angle a rep must go below to count (0 when not angle-based)
  create: () => Exercise;
};

export const EXERCISES: ExerciseDef[] = [
  {
    id: 'squat',
    name: 'Squats',
    unit: 'squats',
    metricLabel: 'knee',
    depthTarget: 110,
    // Both knees bend in a squat: track the straighter one so a shift of weight doesn't count.
    create: () =>
      new AngleRepDetector({
        measure: (kp) => Math.max(...kneeAngles(kp)),
        downAngle: 110,
        upAngle: 155,
        dipAngle: 145,
        minRepMs: 800,
        slowRepMs: 1000,
      }),
  },
  {
    id: 'lunge',
    name: 'Lunges',
    unit: 'lunges',
    metricLabel: 'front knee',
    depthTarget: 105,
    // One knee bends in a lunge: track the more bent one.
    create: () =>
      new AngleRepDetector({
        measure: (kp) => Math.min(...kneeAngles(kp)),
        downAngle: 105,
        upAngle: 155,
        dipAngle: 140,
        minRepMs: 800,
        slowRepMs: 1000,
      }),
  },
  {
    id: 'jumping-jack',
    name: 'Jumping jacks',
    unit: 'jumping jacks',
    metricLabel: 'feet apart',
    depthTarget: 0,
    create: () => new JumpingJackDetector(),
  },
];

// A fresh detector for one exercise. Keep one per player and set; detectors hold the rep count.
export function createDetector(id: ExerciseId): Exercise {
  const def = EXERCISES.find((e) => e.id === id);
  if (!def) {
    throw new Error(`Unknown exercise: ${id}`);
  }
  return def.create();
}
