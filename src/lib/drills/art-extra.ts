/* Built-in equipment drawn in the same flat style as the STRIKE Illustrator elements
 * (100-unit box, same colour-slot convention as art.ts). */
import type { ArtAsset } from "./art";

const K = "k";

export const EXTRA_ART = {
  pole: {
    w: 24,
    h: 100,
    defaults: { c1: "#e84c3d", c2: "#1c2d5a" },
    paths: [
      { d: "M1 94A11 5 0 1 0 23 94A11 5 0 1 0 1 94Z", fill: "c2", stroke: K, sw: 1.6, round: true },
      { d: "M8.5 6H15.5V92H8.5Z", fill: "#ffffff", stroke: null, sw: 0, round: true },
      { d: "M8.5 6H15.5V18H8.5ZM8.5 30H15.5V42H8.5ZM8.5 54H15.5V66H8.5ZM8.5 78H15.5V90H8.5Z", fill: "c1", stroke: null, sw: 0, round: true },
      { d: "M8.5 6H15.5V92H8.5Z", fill: null, stroke: K, sw: 1.6, round: true },
      { d: "M8 5A4 4 0 1 0 16 5A4 4 0 1 0 8 5Z", fill: "c1", stroke: K, sw: 1.4, round: true },
    ],
  },
  hurdle: {
    w: 100,
    h: 56,
    defaults: { c1: "#ffe14d" },
    paths: [
      { d: "M11 14H19V47H11ZM81 14H89V47H81Z", fill: "c1", stroke: K, sw: 1.8, round: true },
      { d: "M5 45H25V52H5ZM75 45H95V52H75Z", fill: "c1d:#d9bd2c", stroke: K, sw: 1.8, round: true },
      { d: "M7 5H93A3 3 0 0 1 96 8V14A3 3 0 0 1 93 17H7A3 3 0 0 1 4 14V8A3 3 0 0 1 7 5Z", fill: "c1", stroke: K, sw: 1.8, round: true },
    ],
  },
  hoop: {
    w: 100,
    h: 100,
    defaults: { c1: "#4da8ff" },
    paths: [
      { d: "M7 50A43 43 0 1 0 93 50A43 43 0 1 0 7 50Z", fill: null, stroke: K, sw: 13, round: true },
      { d: "M7 50A43 43 0 1 0 93 50A43 43 0 1 0 7 50Z", fill: null, stroke: "c1", sw: 9.5, round: true },
    ],
  },
  flag: {
    w: 64,
    h: 100,
    defaults: { c1: "#e84c3d", c2: "#ffffff" },
    paths: [
      { d: "M9 4H13V98H9Z", fill: "c2", stroke: K, sw: 1.4, round: true },
      { d: "M13 6L60 20L13 34Z", fill: "c1", stroke: K, sw: 1.8, round: true },
    ],
  },
  mannequin: {
    w: 56,
    h: 100,
    defaults: { c1: "#ffe14d" },
    paths: [
      { d: "M26 82H30V99H26Z", fill: "#5a6a8a", stroke: K, sw: 1.2, round: true },
      { d: "M12 30C12 25 16 22 21 22H35C40 22 44 25 44 30L41 84H15Z", fill: "c1", stroke: K, sw: 1.8, round: true },
      { d: "M13.3 50H42.7L42.2 58H13.8Z", fill: "c1d:#d9bd2c", stroke: null, sw: 0, round: true },
      { d: "M19 12A9 9 0 1 0 37 12A9 9 0 1 0 19 12Z", fill: "c1", stroke: K, sw: 1.8, round: true },
    ],
  },
} satisfies Record<string, ArtAsset>;
