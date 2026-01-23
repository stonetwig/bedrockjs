export function reactive<T extends object>(target: T): T;

export interface WatchOptions {
  immediate?: boolean;
}

export function watch(fn: () => void, options?: WatchOptions): () => void;

export interface Computed<T> {
  readonly value: T;
  stop(): void;
}

export function computed<T>(getter: () => T): Computed<T>;

export type Signal<T> = [() => T, (value: T) => void];

export function signal<T>(initialValue: T): Signal<T>;

export function batch(fn: () => void): void;
