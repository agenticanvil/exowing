#!/usr/bin/env node

import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createMp3Encoder, createOggEncoder } from "wasm-media-encoders";

const args = new Set(process.argv.slice(2));
const variantId = valueFor("--variant") ?? "barrage";

// Both options share the orchestral engine below, while keeping their tempo,
// harmony, rhythm, mix, and deterministic noise seed independently tweakable.
const VARIANTS = {
  barrage: {
    title: "Aegis Barrage",
    outputBase: "assets/music/aegis-barrage",
    bpm: 152,
    mode: "barrage",
    seed: 0xae61_5ba2,
  },
  "void-assault": {
    title: "Void Assault",
    outputBase: "assets/music/void-assault",
    bpm: 146,
    mode: "void-assault",
    seed: 0x701d_a55a,
  },
};

if (!(variantId in VARIANTS)) {
  fail(`--variant must be one of: ${Object.keys(VARIANTS).join(", ")}`);
}

const CONFIG = {
  sampleRate: 32_000,
  bars: 48,
  beatsPerBar: 4,
  stepsPerBeat: 4,
  bitRate: 96_000,
  vorbisQuality: 2.5,
  ...VARIANTS[variantId],
};

const format = valueFor("--format") ?? "ogg";
const keepWav = args.has("--keep-wav") || format === "wav";
if (!new Set(["ogg", "mp3", "wav"]).has(format)) {
  fail("--format must be ogg, mp3, or wav");
}

const STEPS_PER_BAR = CONFIG.beatsPerBar * CONFIG.stepsPerBeat;
const STEP_SECONDS = 60 / CONFIG.bpm / CONFIG.stepsPerBeat;
const TOTAL_STEPS = CONFIG.bars * STEPS_PER_BAR;
const FRAME_COUNT = Math.round(TOTAL_STEPS * STEP_SECONDS * CONFIG.sampleRate);
const LOOP_SECONDS = FRAME_COUNT / CONFIG.sampleRate;
const left = new Float64Array(FRAME_COUNT);
const right = new Float64Array(FRAME_COUNT);
const random = createRandom(CONFIG.seed);

const HARMONIES = {
  barrage: [
    chord("Dm", 50, [0, 3, 7]),
    chord("Bb", 46, [0, 4, 7]),
    chord("Gm", 43, [0, 3, 7]),
    chord("A", 45, [0, 4, 7]),
    chord("Dm", 50, [0, 3, 7]),
    chord("F", 41, [0, 4, 7]),
    chord("C", 48, [0, 4, 7]),
    chord("A", 45, [0, 4, 7]),
  ],
  "void-assault": [
    chord("C#m", 49, [0, 3, 7]),
    chord("A", 45, [0, 4, 7]),
    chord("E", 40, [0, 4, 7]),
    chord("G#", 44, [0, 4, 7]),
    chord("F#m", 42, [0, 3, 7]),
    chord("D", 38, [0, 4, 7]),
    chord("B", 47, [0, 4, 7]),
    chord("G#", 44, [0, 4, 7]),
  ],
};
const HARMONY = HARMONIES[CONFIG.mode];

// Sparse horn motifs leave room for the rapid string and percussion figures.
const BARRAGE_MOTIFS = [
  [
    69,
    null,
    null,
    69,
    null,
    null,
    72,
    null,
    74,
    null,
    77,
    null,
    76,
    null,
    74,
    null,
  ],
  [
    65,
    null,
    null,
    65,
    null,
    null,
    69,
    null,
    70,
    null,
    74,
    null,
    72,
    null,
    69,
    null,
  ],
  [
    67,
    null,
    null,
    67,
    null,
    null,
    70,
    null,
    74,
    null,
    77,
    null,
    74,
    null,
    70,
    null,
  ],
  [
    69,
    null,
    null,
    73,
    null,
    76,
    null,
    81,
    null,
    79,
    null,
    76,
    null,
    73,
    null,
    null,
  ],
];

const VOID_MOTIFS = [
  [
    68,
    null,
    null,
    71,
    null,
    73,
    null,
    null,
    76,
    null,
    75,
    null,
    71,
    null,
    68,
    null,
  ],
  [
    64,
    null,
    null,
    68,
    null,
    71,
    null,
    76,
    null,
    73,
    null,
    71,
    null,
    68,
    null,
    null,
  ],
  [
    66,
    null,
    66,
    null,
    69,
    null,
    null,
    73,
    null,
    78,
    null,
    76,
    null,
    73,
    null,
    69,
  ],
  [
    68,
    null,
    null,
    68,
    null,
    71,
    null,
    75,
    null,
    80,
    null,
    78,
    null,
    75,
    null,
    71,
  ],
];
const LEAD_MOTIFS = CONFIG.mode === "barrage" ? BARRAGE_MOTIFS : VOID_MOTIFS;

arrange();
applyCircularSpace();
const master = masterTrack();

const outputPath = resolve(`${CONFIG.outputBase}.${format}`);
const wavPath = resolve(
  format === "wav"
    ? `${CONFIG.outputBase}.wav`
    : `tmp/generated-music/${slug(CONFIG.title)}.wav`,
);
mkdirSync(dirname(wavPath), { recursive: true });
mkdirSync(dirname(outputPath), { recursive: true });
if (keepWav) writeWav(wavPath, master.left, master.right, CONFIG.sampleRate);

if (format !== "wav") {
  await encode(master.left, master.right, outputPath, format);
}

const bytes = statSync(outputPath).size;
console.log(`Generated ${CONFIG.title}`);
console.log(
  `  ${CONFIG.bars} bars at ${CONFIG.bpm} BPM (${LOOP_SECONDS.toFixed(3)} s)`,
);
console.log(`  ${CONFIG.sampleRate} Hz stereo ${format.toUpperCase()}`);
console.log(
  `  ${(bytes / 1024).toFixed(1)} KiB (~${((bytes * 8) / LOOP_SECONDS / 1000).toFixed(0)} kbps)`,
);
console.log(`  ${outputPath}`);
if (keepWav && format !== "wav") console.log(`  WAV master: ${wavPath}`);

function arrange() {
  for (let bar = 0; bar < CONFIG.bars; bar++) {
    const start = bar * STEPS_PER_BAR;
    const harmony = HARMONY[bar % HARMONY.length];
    const section = sectionFor(bar);

    addDrums(start, section);
    addBass(start, harmony, section);
    addStringOstinato(start, harmony, section);
    addOrchestraAccents(start, harmony, section);

    if (section === "flight")
      addLead(start, LEAD_MOTIFS[bar % LEAD_MOTIFS.length], 0.2);
    if (section === "danger")
      addLead(start, LEAD_MOTIFS[(bar + 2) % LEAD_MOTIFS.length], 0.22);
    if (section === "climax") {
      addLead(start, LEAD_MOTIFS[bar % LEAD_MOTIFS.length], 0.245);
      addCounterline(start, harmony);
    }

    if (bar % 8 === 0) addImpact(start);
    if (bar === 7 || bar === 19 || bar === 31 || bar === 47)
      addDrumFill(start + 12);
  }
}

function sectionFor(bar) {
  if (bar < 8) return "launch";
  if (bar < 20) return "flight";
  if (bar < 32) return "danger";
  if (bar < 40) return "flight";
  return "climax";
}

function addDrums(start, section) {
  const kickSteps =
    CONFIG.mode === "barrage"
      ? section === "launch"
        ? [0, 8]
        : [0, 6, 8, 14]
      : section === "launch"
        ? [0, 7, 10]
        : [0, 3, 7, 10, 14];
  for (const step of kickSteps)
    addKick(start + step, section === "climax" ? 0.38 : 0.32);
  const snareSteps = CONFIG.mode === "barrage" ? [4, 12] : [5, 12];
  for (const step of snareSteps)
    addSnare(start + step, section === "danger" ? 0.3 : 0.255);
  for (let step = 0; step < STEPS_PER_BAR; step += 2) {
    addHat(
      start + step,
      step % 4 === 0 ? 0.085 : 0.052,
      step % 4 === 0 ? -0.25 : 0.3,
    );
  }
  if (section === "climax") {
    for (const step of [3, 7, 11, 15]) addHat(start + step, 0.055, 0.35);
  }
}

function addBass(start, harmony, section) {
  const pattern =
    section === "launch" ? [0, 0, 7, 0] : [0, 7, 0, 10, 0, 7, 12, 10];
  const spacing = STEPS_PER_BAR / pattern.length;
  for (let index = 0; index < pattern.length; index++) {
    addNote({
      startStep: start + index * spacing,
      durationSteps: spacing * 0.82,
      midi: harmony.root + pattern[index] - 12,
      volume: section === "climax" ? 0.17 : 0.145,
      pan: 0,
      voice: bassVoice,
      attack: 0.003,
      release: 0.055,
    });
  }
}

function addStringOstinato(start, harmony, section) {
  const tones = harmony.tones.map((tone) => tone + 12);
  const pattern =
    CONFIG.mode === "barrage"
      ? [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 0, 2, 1, 2]
      : [0, 0, 2, 1, 0, 2, 0, 1, 0, 2, 1, 2, 0, 1, 2, 1];
  const stride = section === "launch" ? 2 : 1;
  for (let step = 0; step < STEPS_PER_BAR; step += stride) {
    const toneIndex = pattern[step];
    addNote({
      startStep: start + step,
      durationSteps: stride * 0.62,
      midi: tones[toneIndex],
      volume: section === "climax" ? 0.082 : 0.064,
      pan: step % 2 === 0 ? -0.34 : 0.34,
      voice: stringStaccatoVoice,
      attack: 0.008,
      release: 0.045,
    });
  }
}

function addOrchestraAccents(start, harmony, section) {
  const accents =
    CONFIG.mode === "barrage"
      ? section === "launch"
        ? [0, 8]
        : [0, 6, 10, 14]
      : section === "launch"
        ? [0, 10]
        : [0, 5, 8, 11];
  for (const step of accents) {
    for (const midi of harmony.tones) {
      addNote({
        startStep: start + step,
        durationSteps: section === "climax" ? 1.25 : 0.95,
        midi: midi + 12,
        volume: section === "climax" ? 0.073 : 0.052,
        pan: 0,
        voice: brassVoice,
        attack: 0.01,
        release: 0.055,
      });
    }
    if (section === "climax" && step % 2 === 0) {
      for (const midi of [
        harmony.tones[0] + 12,
        harmony.tones[1] + 12,
        harmony.tones[2] + 12,
      ]) {
        addNote({
          startStep: start + step,
          durationSteps: 0.7,
          midi: midi + 12,
          volume: 0.035,
          pan: midi % 2 ? -0.25 : 0.25,
          voice: stringStaccatoVoice,
          attack: 0.006,
          release: 0.04,
        });
      }
    }
  }
}

function addLead(start, notes, volume) {
  for (let step = 0; step < notes.length; step++) {
    const midi = notes[step];
    if (midi === null) continue;
    const duration = notes[step + 1] === null ? 1.75 : 0.82;
    addNote({
      startStep: start + step,
      durationSteps: duration,
      midi,
      volume,
      pan: 0.08,
      voice: CONFIG.mode === "barrage" ? hornLeadVoice : assaultLeadVoice,
      attack: 0.018,
      release: 0.065,
    });
  }
}

function addCounterline(start, harmony) {
  const notes = [
    harmony.tones[0],
    harmony.tones[2],
    harmony.tones[1],
    harmony.tones[2],
  ];
  for (let index = 0; index < notes.length; index++) {
    addNote({
      startStep: start + index * 4,
      durationSteps: 2.8,
      midi: notes[index] + 24,
      volume: 0.062,
      pan: -0.32,
      voice: brassVoice,
      attack: 0.01,
      release: 0.065,
    });
  }
}

function addImpact(step) {
  addKick(step, 0.5);
  addNoiseHit(step, 0.34, 0.42, 0);
  addNote({
    startStep: step,
    durationSteps: 3.5,
    midi: 38,
    volume: 0.18,
    pan: 0,
    voice: impactVoice,
    attack: 0.002,
    release: 0.3,
  });
}

function addDrumFill(start) {
  for (let index = 0; index < 4; index++) {
    addNoiseHit(
      start + index,
      0.095 + index * 0.025,
      0.1,
      index % 2 ? 0.25 : -0.25,
    );
  }
}

function addKick(step, volume) {
  const duration = 0.28;
  addRaw(step, duration, 0, (time) => {
    const phase = 2 * Math.PI * (72 * time - 25 * time * time);
    const overtone = Math.sin(phase * 1.53) * Math.exp(-time * 25) * 0.22;
    return (Math.sin(phase) + overtone) * Math.exp(-time * 13) * volume;
  });
}

function addSnare(step, volume) {
  const noiseSeed = random.int();
  const hitRandom = createRandom(noiseSeed);
  addRaw(step, 0.2, 0.03, (time) => {
    const noise = hitRandom.float() * 2 - 1;
    const body = Math.sin(2 * Math.PI * 185 * time) * 0.45;
    return (noise * 0.72 + body) * Math.exp(-time * 19) * volume;
  });
}

function addHat(step, volume, pan) {
  addNoiseHit(step, volume, 0.045, pan);
}

function addNoiseHit(step, volume, duration, pan) {
  const noiseSeed = random.int();
  const hitRandom = createRandom(noiseSeed);
  let previous = 0;
  addRaw(step, duration, pan, (time) => {
    const noise = hitRandom.float() * 2 - 1;
    const highPassed = noise - previous * 0.86;
    previous = noise;
    return highPassed * Math.exp((-7 * time) / duration) * volume;
  });
}

function addNote({
  startStep,
  durationSteps,
  midi,
  volume,
  pan,
  voice,
  attack,
  release,
}) {
  const frequency = midiToFrequency(midi);
  const duration = durationSteps * STEP_SECONDS;
  addRaw(startStep, duration, pan, (time) => {
    const envelope = adsr(time, duration, attack, release);
    return voice(time, frequency, duration) * envelope * volume;
  });
}

function addRaw(startStep, durationSeconds, pan, sampler) {
  const startFrame = Math.round(
    wrapStep(startStep) * STEP_SECONDS * CONFIG.sampleRate,
  );
  const frameLength = Math.max(
    1,
    Math.round(durationSeconds * CONFIG.sampleRate),
  );
  const leftGain = Math.cos(((pan + 1) * Math.PI) / 4);
  const rightGain = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let frame = 0; frame < frameLength; frame++) {
    const index = (startFrame + frame) % FRAME_COUNT;
    const sample = sampler(frame / CONFIG.sampleRate);
    left[index] += sample * leftGain;
    right[index] += sample * rightGain;
  }
}

function bassVoice(time, frequency) {
  const phase = time * frequency * Math.PI * 2;
  return (
    Math.sin(phase) * 0.64 +
    Math.sin(phase * 2) * 0.2 +
    Math.sin(phase * 3) * 0.11 +
    Math.sin(phase * 5) * 0.05
  );
}

function stringStaccatoVoice(time, frequency) {
  const vibrato = 1 + Math.sin(time * Math.PI * 10.5) * 0.0018;
  const phase = time * frequency * vibrato * Math.PI * 2;
  return (
    Math.sin(phase) * 0.46 +
    Math.sin(phase * 2.002) * 0.24 +
    Math.sin(phase * 3.006) * 0.17 +
    Math.sin(phase * 4.011) * 0.09 +
    Math.sin(phase * 6.018) * 0.04
  );
}

function brassVoice(time, frequency) {
  const phase = time * frequency * Math.PI * 2;
  const brightness = Math.exp(-time * 5.5);
  return (
    Math.sin(phase) * 0.5 +
    Math.sin(phase * 2) * (0.2 + brightness * 0.05) +
    Math.sin(phase * 3) * (0.14 + brightness * 0.04) +
    Math.sin(phase * 4) * 0.07
  );
}

function hornLeadVoice(time, frequency) {
  const vibrato =
    time > 0.12 ? Math.sin((time - 0.12) * Math.PI * 9) * 0.002 : 0;
  const phase = time * frequency * (1 + vibrato) * Math.PI * 2;
  return (
    Math.sin(phase) * 0.58 +
    Math.sin(phase * 2) * 0.2 +
    Math.sin(phase * 3) * 0.13 +
    Math.sin(phase * 5) * 0.06
  );
}

function assaultLeadVoice(time, frequency) {
  const phase = time * frequency * Math.PI * 2;
  const metallicEdge = Math.sin(phase * 2.71) * Math.exp(-time * 4) * 0.08;
  return (
    Math.sin(phase) * 0.53 +
    Math.sin(phase * 2) * 0.2 +
    Math.sin(phase * 3) * 0.13 +
    Math.sin(phase * 4) * 0.06 +
    metallicEdge
  );
}

function impactVoice(time, frequency) {
  const fall = 1 - Math.min(0.55, time * 0.9);
  const phase = time * frequency * fall * Math.PI * 2;
  return (
    (Math.sin(phase) * 0.7 + Math.sin(phase * 1.5) * 0.3) *
    Math.exp(-time * 2.8)
  );
}

function applyCircularSpace() {
  const dryLeft = left.slice();
  const dryRight = right.slice();
  const taps = [
    [0.031, 0.052],
    [0.053, 0.036],
    [0.079, 0.022],
  ];
  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    for (const [seconds, gain] of taps) {
      const offset = Math.round(seconds * CONFIG.sampleRate);
      const source = wrapFrame(frame - offset);
      left[frame] += (dryLeft[source] * 0.93 + dryRight[source] * 0.07) * gain;
      right[frame] += (dryRight[source] * 0.93 + dryLeft[source] * 0.07) * gain;
    }
  }
}

function masterTrack() {
  let peak = 0;
  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    left[frame] = Math.tanh(left[frame] * 1.06);
    right[frame] = Math.tanh(right[frame] * 1.06);
    peak = Math.max(peak, Math.abs(left[frame]), Math.abs(right[frame]));
  }
  const gain = 0.91 / Math.max(peak, 0.001);
  const masteredLeft = new Float32Array(FRAME_COUNT);
  const masteredRight = new Float32Array(FRAME_COUNT);
  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    masteredLeft[frame] = left[frame] * gain;
    masteredRight[frame] = right[frame] * gain;
  }
  return { left: masteredLeft, right: masteredRight };
}

function writeWav(path, wavLeft, wavRight, sampleRate) {
  const channelCount = 2;
  const bytesPerSample = 2;
  const dataLength = wavLeft.length * channelCount * bytesPerSample;
  const buffer = Buffer.allocUnsafe(44 + dataLength);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28);
  buffer.writeUInt16LE(channelCount * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);
  for (let frame = 0; frame < wavLeft.length; frame++) {
    buffer.writeInt16LE(floatToInt16(wavLeft[frame]), 44 + frame * 4);
    buffer.writeInt16LE(floatToInt16(wavRight[frame]), 46 + frame * 4);
  }
  writeFileSync(path, buffer);
}

async function encode(pcmLeft, pcmRight, outputPath, outputFormat) {
  const encoder =
    outputFormat === "ogg"
      ? await createOggEncoder()
      : await createMp3Encoder();
  encoder.configure(
    outputFormat === "ogg"
      ? {
          channels: 2,
          sampleRate: CONFIG.sampleRate,
          vbrQuality: CONFIG.vorbisQuality,
          oggSerialNo: CONFIG.seed,
        }
      : {
          channels: 2,
          sampleRate: CONFIG.sampleRate,
          bitrate: CONFIG.bitRate / 1000,
          outputSampleRate: CONFIG.sampleRate,
        },
  );

  // Small chunks keep the WASM encoder's working memory predictable. Each
  // returned view is copied because the encoder reuses its output buffer.
  const chunks = [];
  const chunkSize = 16_384;
  for (let offset = 0; offset < pcmLeft.length; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, pcmLeft.length);
    chunks.push(
      Buffer.from(
        encoder.encode([
          pcmLeft.subarray(offset, end),
          pcmRight.subarray(offset, end),
        ]),
      ),
    );
  }
  chunks.push(Buffer.from(encoder.finalize()));
  writeFileSync(outputPath, Buffer.concat(chunks));
}

function chord(name, root, intervals) {
  return { name, root, tones: intervals.map((interval) => root + interval) };
}

function adsr(time, duration, attack, release) {
  const attackLevel = Math.min(1, time / Math.max(attack, 0.0001));
  const releaseLevel = Math.min(
    1,
    (duration - time) / Math.max(release, 0.0001),
  );
  return Math.max(0, Math.min(attackLevel, releaseLevel));
}

function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function wrapStep(step) {
  return ((step % TOTAL_STEPS) + TOTAL_STEPS) % TOTAL_STEPS;
}

function wrapFrame(frame) {
  return ((frame % FRAME_COUNT) + FRAME_COUNT) % FRAME_COUNT;
}

function floatToInt16(value) {
  return Math.round(Math.max(-1, Math.min(1, value)) * 32_767);
}

function createRandom(seed) {
  let state = seed >>> 0;
  return {
    float() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4_294_967_296;
    },
    int() {
      this.float();
      return state >>> 0;
    },
  };
}

function slug(value) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/(^-|-$)/g, "");
}

function valueFor(name) {
  const match = [...args].find((argument) => argument.startsWith(`${name}=`));
  return match?.slice(name.length + 1);
}

function fail(message) {
  console.error(message.trim());
  process.exit(1);
}
