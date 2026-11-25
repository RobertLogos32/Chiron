import type { Bounds, Camera, Theme } from './types';
import type { RefObject } from 'react';

export type AiPromptRequest = { prompt: string; selection: Bounds };
export type AiTarget = {
  kind: 'pdf' | 'notebook';
  resourceId: string;
  page?: number;
  pageHeight?: number;
  paneId?: string;
};
export type AiPromptSender = (
  request: AiPromptRequest & { scope: string },
  signal: AbortSignal,
) => Promise<string>;
export type AiJob = {
  id: string;
  scope: string;
  prompt: string;
  area: Bounds;
  status: 'pending' | 'success' | 'error';
  response?: string;
  target?: AiTarget;
  lockScope?: string;
};
export type AiSurface = {
  anchor: RefObject<HTMLDivElement | null>;
  camera: Camera;
  theme: Theme;
  context: 'pdf' | 'notebook';
  target?: AiTarget;
  reveal?: (area: Bounds) => void;
  ready?: boolean;
};
