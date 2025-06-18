/**
 * A tuple type representing a successful attempt result.
 * The first element is `null` (no error), and the second is the successful result.
 */
type AttemptSuccess<T> = readonly [null, T];

/**
 * A tuple type representing a failed attempt result.
 * The first element is the error, and the second is `null` (no result).
 */
type AttemptFailure<E> = readonly [E, null];

/**
 * A union type representing either a successful or failed attempt.
 */
type AttemptResult<E, T> = AttemptSuccess<T> | AttemptFailure<E>;

/**
 * An asynchronous version of {@link AttemptResult}.
 */
type AttemptResultAsync<E, T> = Promise<AttemptResult<E, T>>;

/**
 * Attempts to execute an asynchronous operation and returns a tuple representing success or failure.
 *
 * @param operation - A `Promise` representing the async operation to attempt.
 * @returns A promise that resolves to an {@link AttemptResult} tuple.
 *
 * @example
 * ```ts
 * const [err, result] = await attempt(fetchData());
 * if (err) { handleError(err); }
 * else { handleSuccess(result); }
 * ```
 */
export function attempt<E = Error, T = unknown>(operation: Promise<T>): AttemptResultAsync<E, T>;

/**
 * Attempts to execute a synchronous operation and returns a tuple representing success or failure.
 *
 * @param operation - A function to execute synchronously.
 * @returns An {@link AttemptResult} tuple.
 *
 * @example
 * ```ts
 * const [err, result] = attempt(() => doSomething());
 * if (err) { handleError(err); }
 * else { handleSuccess(result); }
 * ```
 */
export function attempt<E = Error, T = unknown>(operation: () => T): AttemptResult<E, T>;

/**
 * Internal implementation of `attempt`, handling both sync and async operations.
 *
 * @param operation - A `Promise` or function to execute.
 * @returns A result tuple or a promise of one, depending on input type.
 */
export function attempt<E = Error, T = unknown>(
	operation: Promise<T> | (() => T)
): AttemptResult<E, T> | AttemptResultAsync<E, T> {
	if (operation instanceof Promise) {
		return operation
			.then((value: T) => [null, value] as const)
			.catch((error: E) => [error, null] as const);
	}

	try {
		const data = operation();
		return [null, data];
	} catch (error) {
		return [error as E, null];
	}
}
