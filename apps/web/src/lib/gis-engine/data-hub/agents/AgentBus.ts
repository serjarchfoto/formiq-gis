import type { AgentBusApi, AgentMessage } from "./types";

export class AgentBus implements AgentBusApi {
  private readonly listeners = new Set<(message: AgentMessage) => void>();

  publish<T>(message: Omit<AgentMessage<T>, "id" | "createdAt">): AgentMessage<T> {
    const full: AgentMessage<T> = { ...message, id: `agent-message:${Date.now()}:${Math.random().toString(36).slice(2)}`, createdAt: new Date().toISOString() };
    for (const listener of this.listeners) listener(full as AgentMessage);
    return full;
  }

  subscribe<T>(listener: (message: AgentMessage<T>) => void): () => void {
    this.listeners.add(listener as (message: AgentMessage) => void);
    return () => this.listeners.delete(listener as (message: AgentMessage) => void);
  }
}
