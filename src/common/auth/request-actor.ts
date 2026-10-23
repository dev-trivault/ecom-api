import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage<{ userId: string }>();

/** Runs `fn` with `userId` as the signed-in user that database writes are stamped with. */
export function runAsActor<T>(userId: string, fn: () => T): T {
  return storage.run({ userId }, fn);
}

/** The signed-in user of the current request, or undefined for public routes, the seed and scripts. */
export function currentActorId(): string | undefined {
  return storage.getStore()?.userId;
}
