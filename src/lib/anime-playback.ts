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
  /** Audio track to start with when the stream carries several (e.g. "English"). */
  audio?: string;
  skip?: {
    intro?: { start: number; end: number };
    outro?: { start: number; end: number };
  };
  servers: { id: string; label: string; src: string; latencyMs: number }[];
};
export type PlaybackMode = "auto" | "smooth";
