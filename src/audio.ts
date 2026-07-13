type SoundUrl = string;

const SOUND_URLS = {
  "player-fire": new URL("../assets/sfx/player-fire-1.mp3", import.meta.url)
    .href,
} as const satisfies Record<string, SoundUrl>;

export type SoundId = keyof typeof SOUND_URLS;

export type AudioSettings = {
  muted: boolean;
  masterVolume: number;
  sfxVolume: number;
};

export type PlaySoundOptions = {
  volume?: number;
  playbackRate?: number;
  pan?: number;
};

export type LoopingSound = {
  setVolume: (volume: number) => void;
  stop: () => void;
};

export type GameAudio = {
  preload: () => Promise<void>;
  resume: () => Promise<void>;
  play: (id: SoundId, options?: PlaySoundOptions) => void;
  playLoop: (id: SoundId, options?: PlaySoundOptions) => LoopingSound;
  applySettings: (settings: AudioSettings) => void;
};

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  muted: false,
  masterVolume: 0.82,
  sfxVolume: 0.9,
};

type WebAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export function createAudioSystem(): GameAudio {
  let context: AudioContext | undefined;
  let masterGain: GainNode | undefined;
  let sfxGain: GainNode | undefined;
  let loadPromise: Promise<void> | undefined;
  let settings = { ...DEFAULT_AUDIO_SETTINGS };
  const buffers = new Map<SoundId, AudioBuffer>();

  async function preload(): Promise<void> {
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    loadPromise ??= loadBuffers(ctx);
    await loadPromise;
  }

  async function resume(): Promise<void> {
    const ctx = ensureContext();
    if (!ctx) return;
    const resumePromise =
      ctx.state === "suspended"
        ? ctx.resume().catch(() => undefined)
        : Promise.resolve();
    await Promise.all([preload(), resumePromise]);
  }

  function play(id: SoundId, options: PlaySoundOptions = {}): void {
    void playAsync(id, options).catch(() => undefined);
  }

  function playLoop(id: SoundId, options: PlaySoundOptions = {}): LoopingSound {
    let source: AudioBufferSourceNode | undefined;
    let gain: GainNode | undefined;
    let stopped = false;
    let volume = clamp(options.volume ?? 1, 0, 1);

    const handle: LoopingSound = {
      setVolume(nextVolume) {
        volume = clamp(nextVolume, 0, 1);
        if (gain) gain.gain.value = volume;
      },
      stop() {
        stopped = true;
        try {
          source?.stop();
        } catch {
          // Stopping an already-ended source is harmless.
        }
        source?.disconnect();
        gain?.disconnect();
      },
    };

    const ctx = ensureContext();
    if (ctx) void startLoop(ctx).catch(() => undefined);
    return handle;

    async function startLoop(loopContext: AudioContext): Promise<void> {
      loadPromise ??= loadBuffers(loopContext);
      await loadPromise;
      if (stopped || !sfxGain) return;

      const buffer = buffers.get(id);
      if (!buffer) return;
      source = loopContext.createBufferSource();
      gain = loopContext.createGain();
      source.buffer = buffer;
      source.loop = true;
      source.playbackRate.value = options.playbackRate ?? 1;
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(sfxGain);
      source.start();
    }
  }

  function applySettings(nextSettings: AudioSettings): void {
    settings = {
      muted: nextSettings.muted,
      masterVolume: clamp(nextSettings.masterVolume, 0, 1),
      sfxVolume: clamp(nextSettings.sfxVolume, 0, 1),
    };
    applyGainSettings();
  }

  async function playAsync(
    id: SoundId,
    options: PlaySoundOptions,
  ): Promise<void> {
    if (settings.muted) return;
    const ctx = ensureContext();
    if (!ctx) return;
    loadPromise ??= loadBuffers(ctx);
    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
    await loadPromise;

    const buffer = buffers.get(id);
    if (!buffer || !sfxGain) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = options.playbackRate ?? 1;
    gain.gain.value = clamp(options.volume ?? 1, 0, 1);
    source.connect(gain);

    if (options.pan !== undefined && "createStereoPanner" in ctx) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(options.pan, -1, 1);
      gain.connect(panner);
      panner.connect(sfxGain);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        panner.disconnect();
      };
    } else {
      gain.connect(sfxGain);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
    }
    source.start();
  }

  function ensureContext(): AudioContext | undefined {
    if (context) return context;
    const AudioContextCtor =
      window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext;
    if (!AudioContextCtor) return undefined;
    context = new AudioContextCtor();
    masterGain = context.createGain();
    sfxGain = context.createGain();
    sfxGain.connect(masterGain);
    masterGain.connect(context.destination);
    applyGainSettings();
    return context;
  }

  function applyGainSettings(): void {
    if (masterGain)
      masterGain.gain.value = settings.muted ? 0 : settings.masterVolume;
    if (sfxGain) sfxGain.gain.value = settings.sfxVolume;
  }

  async function loadBuffers(ctx: AudioContext): Promise<void> {
    try {
      await Promise.all(
        (Object.entries(SOUND_URLS) as Array<[SoundId, string]>).map(
          async ([id, url]) => {
            const response = await fetch(url);
            if (!response.ok)
              throw new Error(`Failed to load sound ${id}: ${response.status}`);
            const data = await response.arrayBuffer();
            buffers.set(id, await ctx.decodeAudioData(data));
          },
        ),
      );
    } catch (error) {
      loadPromise = undefined;
      throw error;
    }
  }

  return { preload, resume, play, playLoop, applySettings };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
