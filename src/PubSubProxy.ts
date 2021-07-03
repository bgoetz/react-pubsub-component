// Copyright (c) 2021 Ben Goetz
//
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import { proxyGetter, PubSub } from "./ReactPubSubComponent";

/** A proxy for unregistered {@link PubSubComponent} to allow for pre-registration use by the parent. */
export class PubSubProxy {
    /** Allows parents to get pub/sub promises. */
    public readonly async : PubSub.Awaitable<any>;
    /** Allows parents to subscribe to triggers. */
    public readonly sub : PubSub.Subscribable<any>;
    /** Allows parents to unsubscribe to triggers. */
    public readonly unsub : PubSub.Subscribable<any>;

    /** Maps trigger keys to a set of all pending promises for that trigger. */
    private readonly promises : Map<string, Set<(value : any | PromiseLike<any>) => void>> = new Map<string, Set<(value : any | PromiseLike<any>) => void>>();
    /** Maps trigger keys to a set of all registered callbacks for that trigger. */
    private readonly subscriptions : Map<string, Set<VoidFunction>> = new Map<string, Set<VoidFunction>>();

    public constructor() {
        // Build the `async` object to transform properties into promises.
        this.async = new Proxy({}, {
            get : proxyGetter((_, property) =>
                new Promise((resolve) => {
                    this.getTriggerSet(this.promises, property).add(resolve);
                })
            ),
        }) as PubSub.Awaitable<any>;

        // Build the `sub` object to transform properties into subscribe functions.
        this.sub = new Proxy({}, {
            get : proxyGetter((_, property) =>
                this.triggerSubscribe.bind(this, property)
            ),
        }) as PubSub.Subscribable<any>;

        // Build the `unsub` object to transform properties unsubscribe functions.
        this.unsub = new Proxy({}, {
            get : proxyGetter((_, property) =>
                this.triggerUnsubscribe.bind(this, property)
            ),
        }) as PubSub.Subscribable<any>;
    }

    /** Finalize the triggers and forward the callbacks and promises to a new component. */
    public finalize(pubsub : PubSub.PubSubObject<any>) {
        // Forward all promises.
        this.promises.forEach((promises, key) => {
            promises.forEach(async (resolve) => {
                // @ts-expect-error This complains about there not being an index signature, which we are intentionally avoiding.
                resolve(await (pubsub.async[key] as Promise<any>));
            });
        });

        // Register all callbacks.
        this.subscriptions.forEach((subscriptions, key) => {
            subscriptions.forEach((callback) => {
                // @ts-expect-error This complains about there not being an index signature, which we are intentionally avoiding.
                (pubsub.sub[key] as (callback : VoidFunction) => void)(callback);
            });
        });

        // Clear held references.
        this.promises.clear();
        this.subscriptions.clear();
    }

    /* Returns the set that tracks the provided trigger key within a given set mapping. */
    private getTriggerSet<M>(map : Map<string, Set<M>>, key : string) {
        let set = map.get(key);
        if (set === undefined) {
            set = new Set();
            map.set(key, set);
        }

        return set;
    }

    /**
     * Register a callback that will be called each time the provided trigger executes.
     * Attempting to register the same callback will silently fail.
     */
    private triggerSubscribe(key : string, callback : VoidFunction) {
        this.getTriggerSet(this.subscriptions, key).add(callback);
    }

    /**
     * Remove a registered callback that will be called each time the provided trigger executes.
     * Does not throw an error if the callback is not previously registered.
     */
    private triggerUnsubscribe(key : string, callback : VoidFunction) {
        const set = this.getTriggerSet(this.subscriptions, key);
        set.delete(callback);

        if (set.size === 0) {
            this.subscriptions.delete(key);
        }
    }
}
