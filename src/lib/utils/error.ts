/**
 * Result type for successful operations
 * @template T - The type of the successful data
 */
type Success<T> = { data: T; error: null };

/**
 * Result type for failed operations
 * @template E - The type of the error
 */
type Failure<E> = { data: null; error: E };

/**
 * Union type representing either success or failure for synchronous operations
 * @template T - The type of the successful data
 * @template E - The type of the error (defaults to Error)
 */
type ResultSync<T, E> = Success<T> | Failure<E>;

/**
 * Promise wrapper for ResultSync, used for asynchronous operations
 * @template T - The type of the successful data
 * @template E - The type of the error (defaults to Error)
 */
type ResultAsync<T, E> = Promise<ResultSync<T, E>>;

/**
 * A utility function that wraps operations in try-catch blocks and returns a consistent result format.
 * Eliminates the need for explicit try-catch blocks and provides a functional approach to error handling.
 *
 * @template T - The expected return type of the operation
 * @template E - The expected error type (defaults to Error)
 *
 * @param {Promise<T>} operation - An async operation (Promise) to execute safely
 * @returns {ResultAsync<T, E>} A promise that resolves to either success or failure result
 *
 * @example
 * // Async operation example
 * const result = await tryCatch(fetch('/api/data'));
 * if (result.error) {
 *   console.error('Fetch failed:', result.error.message);
 * } else {
 *   console.log('Success:', result.data);
 * }
 */
export function tryCatch<T, E = Error>(operation: Promise<T>): ResultAsync<T, E>;

/**
 * A utility function that wraps synchronous operations in try-catch blocks.
 *
 * @template T - The expected return type of the operation
 * @template E - The expected error type (defaults to Error)
 *
 * @param {() => T} operation - A synchronous function to execute safely
 * @returns {ResultSync<T, E>} Either a success result with data or failure result with error
 *
 * @example
 * // Sync operation example
 * const result = tryCatch(() => JSON.parse(jsonString));
 * if (result.error) {
 *   console.error('Parse failed:', result.error.message);
 * } else {
 *   console.log('Parsed data:', result.data);
 * }
 */
export function tryCatch<T, E = Error>(operation: () => T): ResultSync<T, E>;

/**
 * Universal tryCatch implementation that handles both sync and async operations.
 * This overload should not be called directly - use the specific overloads above.
 *
 * ## Key Benefits:
 * - **Consistent Error Handling**: Always returns the same result structure
 * - **No Thrown Exceptions**: Converts all errors into return values
 * - **Type Safe**: Preserves TypeScript types for both success and error cases
 * - **Functional Style**: Encourages functional error handling patterns
 *
 * ## Usage Patterns:
 *
 * ### Basic Async Usage:
 * ```typescript
 * const fetchResult = await tryCatch(fetch('/api/users'));
 * if (fetchResult.error) {
 *   // Handle error case
 *   return { users: [], error: fetchResult.error.message };
 * }
 * // Use successful result
 * const response = fetchResult.data;
 * ```
 *
 * ### Basic Sync Usage:
 * ```typescript
 * const parseResult = tryCatch(() => JSON.parse(userInput));
 * if (parseResult.error) {
 *   return 'Invalid JSON provided';
 * }
 * return parseResult.data;
 * ```
 *
 * ### Chaining Operations:
 * ```typescript
 * const fetchResult = await tryCatch(fetch('/api/data'));
 * if (fetchResult.error) return handleFetchError(fetchResult.error);
 *
 * const jsonResult = await tryCatch(fetchResult.data.json());
 * if (jsonResult.error) return handleParseError(jsonResult.error);
 *
 * return processData(jsonResult.data);
 * ```
 *
 * ### Custom Error Types:
 * ```typescript
 * interface ApiError {
 *   code: number;
 *   message: string;
 * }
 *
 * const result = await tryCatch<User[], ApiError>(fetchUsers());
 * if (result.error) {
 *   console.log(`API Error ${result.error.code}: ${result.error.message}`);
 * }
 * ```
 *
 * ### File Operations:
 * ```typescript
 * const fileResult = tryCatch(() => fs.readFileSync('config.json', 'utf8'));
 * if (fileResult.error) {
 *   console.warn('Config file not found, using defaults');
 *   return defaultConfig;
 * }
 *
 * const configResult = tryCatch(() => JSON.parse(fileResult.data));
 * if (configResult.error) {
 *   console.error('Invalid config file format');
 *   return defaultConfig;
 * }
 *
 * return configResult.data;
 * ```
 *
 * @param {Promise<T> | (() => T)} operation - Either a Promise or a function to execute
 * @returns {ResultSync<T, E> | ResultAsync<T, E>} Result object with either data or error
 */
export function tryCatch<T, E = Error>(operation: Promise<T>): ResultAsync<T, E>;
export function tryCatch<T, E = Error>(operation: () => T): ResultSync<T, E>;
export function tryCatch<T, E = Error>(
	operation: Promise<T> | (() => T)
): ResultSync<T, E> | ResultAsync<T, E> {
	if (operation instanceof Promise) {
		return operation
			.then((value: T) => ({ data: value, error: null }))
			.catch((error: E) => ({ data: null, error }));
	}

	try {
		const data = operation();
		return { data, error: null };
	} catch (error) {
		return { data: null, error: error as E };
	}
}
