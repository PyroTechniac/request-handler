export class RequestHandler<K, V extends IdKeyed<K>> {

	public getFn: GetFn<K, V>;
	public getAllFn: GetAllFn<K, V>;
	private queue = new Map<K, ReferredPromise<V | null>>();
	private synchronizing: Promise<void> | null = null;

	public constructor(getFn: GetFn<K, V>, getAllFn: GetAllFn<K, V>) {
		this.getFn = getFn;
		this.getAllFn = getAllFn;
	}

	public get available(): boolean {
		return this.synchronizing === null;
	}

	public push(key: K): Promise<V> {
		// Check if there was a previous referred promise, and return if it does exist.
		const previous = this.queue.get(key);
		if (typeof previous !== 'undefined') return previous.promise;

		// Create a new referred promise, and return the promise itself
		const referredPromise = this.createReferPromise();
		this.queue.set(key, referredPromise);
		if (this.available) this.synchronizing = this.run();
		return referredPromise.promise;
	}

	private async run(): Promise<void> {
		const { queue } = this;
		this.queue = new Map();

		const keys = [...queue.keys()];
		if (keys.length === 1) {
			const [key] = keys;
			try {
				const value = await this.getFn(key);
				queue.get(key).resolve(value);
			} catch (error) {
				queue.get(key).reject(error);
			}
		} else if (keys.length > 1) {
			try {
				const values = await this.getAllFn(keys);
				for (const value of values) {
					const entry = queue.get(value.id);
					if (typeof entry === 'undefined') continue;
					entry.resolve(value);
					queue.delete(value.id);
				}
				for (const entry of queue.values()) {
					entry.resolve(null);
				}
			} catch (error) {
				for (const entry of queue.values()) {
					entry.reject(error);
				}
			}
		}

		this.synchronizing = this.queue.size === 0 ? null : this.run();
	}

	private createReferPromise(): ReferredPromise<V> {
		let resolve: (value?: V) => void;
		let reject: (error?: Error) => void;
		const promise = new Promise<V>((res, rej) => {
			resolve = res;
			reject = rej;
		});

		return { promise, resolve, reject };
	}

}

export interface IdKeyed<K> {
	id: K;
}

export interface GetFn<K, V> {
	(key: K): Promise<V>;
}

export interface GetAllFn<K, V> {
	(keys: K[]): Promise<V[]>;
}

export interface ReferredPromise<T> {
	promise: Promise<T>;
	resolve(value?: T): void;
	reject(error?: Error): void;
}