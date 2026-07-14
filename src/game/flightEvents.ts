import type { Vec3 } from "../sim/types";

export type FlightEvent =
  | { type: "player-fired" }
  | {
      type: "enemy-exploded";
      position: Vec3;
      listenerPosition: Vec3;
    };

export type FlightEventSink = {
  emit: (event: FlightEvent) => void;
};

type FlightEventListener = (event: FlightEvent) => void;

export class FlightEventBus implements FlightEventSink {
  private readonly listeners = new Set<FlightEventListener>();

  emit(event: FlightEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: FlightEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
