import type { BoardWritePlacement, Bounds, Camera, TextNote, Theme } from './types';
import type { RefObject } from 'react';

export type AiPromptRequest = { prompt: string; selection: Bounds };
export type RegionBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export type ExplainedRegion = RegionBounds & { explanation: string };
export type AiCapture = {
  image: string;
  guide?: { image: string; regions: RegionBounds[] };
};
export type AiWrite = { kind: 'text' | 'latex'; content: string };
export type AiWriteStyle = 'note' | 'solution';
export type AiAnswer = {
  response: string;
  annotations: ExplainedRegion[];
  writes: AiWrite[];
  writePlacement?: BoardWritePlacement;
  writeStyle?: AiWriteStyle;
};
export type AiTarget = {
  kind: 'pdf' | 'notebook';
  resourceId: string;
  page?: number;
  pageHeight?: number;
  paneId?: string;
};
export type AiPromptSender = (
  request: AiPromptRequest & AiCapture & { scope: string; canWrite: boolean },
  signal: AbortSignal,
) => Promise<AiAnswer>;
export type AiJob = {
  id: string;
  scope: string;
  prompt: string;
  capture?: AiCapture;
  area: Bounds;
  status: 'pending' | 'success' | 'error';
  answer?: AiAnswer;
  error?: string;
  target?: AiTarget;
  lockScope?: string;
  destination?: AiBoardLocation;
  written?: AiBoardLocation;
  writeBlocked?: boolean;
};
export type AiBoardLocation = { scope: string; area: Bounds; target?: AiTarget };
export type AiSurface = {
  anchor: RefObject<HTMLDivElement | null>;
  camera: Camera;
  theme: Theme;
  context: 'pdf' | 'notebook';
  target?: AiTarget;
  reveal?: (area: Bounds) => void;
  write?: (
    notes: TextNote[],
    area: Bounds,
    otherLockedAreas: Bounds[],
    placement?: BoardWritePlacement,
  ) => Bounds | null;
  ready?: boolean;
};
