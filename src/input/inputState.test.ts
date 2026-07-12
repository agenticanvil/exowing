import { describe, expect, it } from 'vitest';
import { InputState } from './inputState';

class FakeWindow {
  listeners = new Map<string, Set<EventListener>>();
  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }
  dispatch(type: string, code: string, repeat = false) {
    const event = { code, repeat, preventDefault() {} } as KeyboardEvent;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

describe('InputState', () => {
  it('maps held keys and consumes roll presses', () => {
    const target = new FakeWindow();
    const input = new InputState(target as Pick<Window, 'addEventListener' | 'removeEventListener'>);
    target.dispatch('keydown', 'KeyD');
    target.dispatch('keydown', 'KeyQ');
    expect(input.command()).toMatchObject({ steerX: 1, roll: -1 });
    expect(input.command().roll).toBe(0);
  });

  it('removes listeners and clears state on disposal', () => {
    const target = new FakeWindow();
    const input = new InputState(target as Pick<Window, 'addEventListener' | 'removeEventListener'>);
    target.dispatch('keydown', 'Space');
    input.dispose();
    expect(input.command().fire).toBe(false);
    expect([...target.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
  });
});
