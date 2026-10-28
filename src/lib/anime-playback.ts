export type PlaybackTrack = {
  src: string;
  label: string;
  language: string;
  default: boolean;
};
export type PlaybackMedia = {
  src: string;
  tracks: PlaybackTrack[];
  poster?: string;
  skip?: {
    intro?: { start: number; end: number };
    outro?: { start: number; end: number };
  };
  servers: { id: string; label: string; src: string; latencyMs: number }[];
};
export type PlaybackMode = "auto" | "smooth";
