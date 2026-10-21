// Course presets. Distances in metres. Check against the club's current card before use.
const yd = (y) => Math.round(y * 0.9144);
const PAR = [4, 4, 4, 5, 3, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4];
const SI = [14, 12, 2, 10, 18, 16, 8, 4, 6, 1, 17, 13, 11, 3, 9, 15, 5, 7];
const WHITE = [388, 320, 408, 493, 149, 510, 221, 371, 419, 416, 170, 560, 375, 421, 198, 527, 413, 402];
const RED = [348, 294, 351, 452, 122, 451, 176, 311, 370, 301, 131, 489, 332, 384, 164, 466, 361, 317];

export const PRESETS = {
  seasons: {
    name: 'Seasons Golf Course',
    holes: PAR.map((par, i) => ({ par, si: SI[i], len: { white: yd(WHITE[i]), red: yd(RED[i]) } })),
    tees: [
      { code: 'wm', label: 'White · Men', cr: 71.8, slope: 128, len: 'white', gender: 'M' },
      { code: 'rm', label: 'Red · Men', cr: 67.6, slope: 117, len: 'red', gender: 'M' },
      { code: 'rl', label: 'Red · Ladies', cr: 73.0, slope: 133, len: 'red', gender: 'F' },
    ],
  },
  blank: {
    name: 'New course',
    holes: Array.from({ length: 18 }, (_, i) => ({ par: 4, si: i + 1, len: { white: 0, red: 0 } })),
    tees: [
      { code: 'wm', label: 'White · Men', cr: 72, slope: 113, len: 'white', gender: 'M' },
      { code: 'rl', label: 'Red · Ladies', cr: 72, slope: 113, len: 'red', gender: 'F' },
    ],
  },
};

export function defaultTee(tees, gender) {
  return (tees.find((t) => t.gender === gender) || tees[0] || {}).code;
}
