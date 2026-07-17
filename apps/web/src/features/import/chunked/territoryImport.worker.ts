/// <reference lib="webworker" />

import { processFeaturesIntoChunks } from "@/lib/gis-engine/chunks";
import type { ChunkProcessingRequest } from "@/lib/gis-engine/chunks";

const sessionFeatureKeys = new Map<string, Set<string>>();

type ResetMessage = { type: "reset"; sessionId: string };

function isResetMessage(message: ChunkProcessingRequest | ResetMessage): message is ResetMessage {
  return "type" in message && message.type === "reset";
}

self.onmessage = (event: MessageEvent<ChunkProcessingRequest | ResetMessage>) => {
  if (isResetMessage(event.data)) {
    sessionFeatureKeys.set(event.data.sessionId, new Set());
    return;
  }

  const request = event.data;
  const seen = sessionFeatureKeys.get(request.sessionId) ?? new Set<string>();
  sessionFeatureKeys.set(request.sessionId, seen);
  self.postMessage(processFeaturesIntoChunks(request, seen));
};

export {};
