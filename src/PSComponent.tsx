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

import * as React from "react";

import { proxyGetter, proxySetter, PubSub, simpleProxy } from "./ReactPubSubComponent";
import { PubSubProxy } from "./PubSubProxy";

/** All components wishing to register child pub/sub components must include this as part of their component props. */
interface PubSubProps {
    pubsub? : [string, ...PubSub.ChildSubsFromTriggersObject<any>[]] | [PubSub.RestrictProperties<any, PubSub.PubSubObject<any>>, string, ...PubSub.ChildSubsFromTriggersObject<any>[]];
}
/** The base triggers that are included within any pub/sub component. */
export interface PubSubTriggers {
    /** Triggered in React.Component#componentDidMount(). */
    componentDidMount() : void;
    /** Triggered in React.Component#componentDidUpdate(). */
    componentDidUpdate() : void;
    /** Triggered in React.Component#componentWillUnmount(). */
    componentWillUnmount() : void;
}
/**
 * Expands upon the base React component to include a pub/sub messaging system. This requires an additional generic type parameter
 * along with the Props and State types. This parameter can have any properties which will become the triggerable functions. These
 * properties must either be a function that returns `void | Promise<void>`.
 * 
 * Trigger a pub/sub message by calling `this.pub.<message>(...parameters)`.
 * 
 * Generate a promise that will resolve the next time a specific trigger is executed by getting `this.ps.<childId>.async.<triggerId>`.
 * Subscribe to a pub/sub trigger by calling `this.ps.<childId>.sub.<triggerId>(<callback>)`.
 * Unsubscribe from a pub/sub trigger by calling `this.ps.<childId>.sub.<triggerId>(<callback>)`.
 */
export abstract class PSComponent<P = {}, S = {}, Triggers extends PubSub.RestrictTriggers<Triggers> = {}, ChildSubs extends PubSub.RestrictTriggerObjects<ChildSubs> = {}, SS = any, AllTriggers = Triggers & PubSubTriggers> extends React.Component<P & PubSubProps, S, SS> {
    /** Allows parents to get pub/sub promises. */
    public readonly async : PubSub.Awaitable<AllTriggers>;
    /** Allows parents to subscribe to triggers. */
    public readonly sub : PubSub.Subscribable<AllTriggers>;
    /** Allows parents to unsubscribe to triggers */
    public readonly unsub : PubSub.Subscribable<AllTriggers>;

    /** All the registered child pubsub components. */
    protected readonly ps : PubSub.ChildSubsFromTriggersObject<ChildSubs>;
    /** Executes pub/sub triggers. */
    protected readonly pub : PubSub.Triggerable<Triggers> & PubSub.Triggerable<PubSubTriggers>;
    /** A simplified version of the `PSComponent` that holds references to the same `async`, `sub`, and `unsub` objects. */
    protected readonly pubsubObject : PubSub.PubSubObject<Triggers>;

    /** Maps trigger keys to a set of all pending promises for that trigger. */
    private readonly promises : Map<keyof AllTriggers, Set<(value : any | PromiseLike<any>) => void>> = new Map<keyof AllTriggers, Set<(value : any | PromiseLike<any>) => void>>();
    /** Maps trigger keys to a set of all registered callbacks for that trigger. */
    private readonly subscriptions : Map<keyof AllTriggers, Set<VoidFunction>> = new Map<keyof AllTriggers, Set<VoidFunction>>();

    /** If this component has had its triggers finalized yet. */
    private finalized : boolean = false;

    public constructor(props : P) {
        super(props);

        // Ensure all functions are properly bound.
        this.trigger = this.trigger.bind(this);
        this.getTriggerSet = this.getTriggerSet.bind(this);
        this.triggerPromise = this.triggerPromise.bind(this);
        this.triggerSubscribe = this.triggerSubscribe.bind(this);
        this.triggerUnsubscribe = this.triggerUnsubscribe.bind(this);

        // These Proxies transforms all string properties of an object to functions or promises. We rely on TypeScript to provide
        // errors when trying to get known parameters.

        /// PUBLIC PROXIES ///

        // Build the `async` object to transform properties into promises.
        this.async = new Proxy({}, {
            get : proxyGetter((_, property) =>
                this.triggerPromise(property as keyof AllTriggers)
            ),
        }) as PubSub.Awaitable<AllTriggers>;

        // Build the `sub` object to transform properties into subscribe functions.
        this.sub = new Proxy({}, {
            get : proxyGetter((_, property) =>
                this.triggerSubscribe.bind(this, property as keyof AllTriggers)
            ),
        }) as PubSub.Subscribable<AllTriggers>;

        // Build the `unsub` object to transform properties unsubscribe functions.
        this.unsub = new Proxy({}, {
            get : proxyGetter((_, property) =>
                this.triggerUnsubscribe.bind(this, property as keyof AllTriggers)
            ),
        }) as PubSub.Subscribable<AllTriggers>;

        /// PROTECTED PROXIES ///

        // Build the `pub` object to transform properties into triggers.
        /*
        this.pub = new Proxy({}, {
            get : proxyGetter((_, property) =>
                this.trigger.bind(this, property)
            ),
        }) as PubSub.Triggerable<Triggers> & PubSub.Triggerable<PubSubTriggers>;
        */
        this.pub = simpleProxy((_, property) => this.trigger.bind(this, property));

        // Build the proxy that allows for child pub/sub access. We don't want to require partial handline, so we'll set up a
        // deferred registration mechanism for handlers and promises that will trigger / resolve when the child is registered.
        this.ps = new Proxy({} as { [K : string] : any }, {
            get : proxyGetter((target, property) => {
                // The child isn't set yet, so we need to set as a proxy until it is registered.
                if (!target.hasOwnProperty(property)) {
                    target[property] = new PubSubProxy();
                }

                return target[property];
            }),
            set : proxySetter((target, property, value : PubSub.PubSubObject<Triggers>) => {
                // It's already registered.
                if (target.hasOwnProperty(property)) {
                    // It was registered as a proxy.
                    if (target[property] instanceof PubSubProxy) {
                        (target[property] as PubSubProxy).finalize(value);
                    } else {
                        // Forward to the new child.
                        this.finalizeTriggers(value);
                    }
                }

                // Register the child.
                target[property] = value;

                return true;
            }),
        }) as PubSub.ChildSubsFromTriggersObject<ChildSubs>;

        // Create the simplified object.
        this.pubsubObject = {
            async : this.async as unknown as PubSub.Awaitable<Triggers & PubSubTriggers>,
            sub : this.sub as unknown as PubSub.Subscribable<Triggers & PubSubTriggers>,
            unsub : this.unsub as unknown as PubSub.Subscribable<Triggers & PubSubTriggers>,
            _finalizeTriggers : this.finalizeTriggers.bind(this),
        };

        // Register this child with the parent.
        const pubsub = this.props.pubsub;
        if (pubsub !== undefined) {
            let [parentPubsubs, id, ...globals] = pubsub;

            if (typeof parentPubsubs === "string") {
                if (typeof id === "string") {
                    throw new TypeError("ID cannot be a string.");
                }
                globals = [id].concat(globals);
                id = parentPubsubs;
            } else {
                if (typeof id !== "string") {
                    throw new TypeError("ID must be a string.");
                }

                // @ts-expect-error This complains about there not being an index signature, which we are intentionally avoiding.
                parentPubsubs[id] = this.pubsubObject;
            }

            // Register the globals.
            globals.forEach((global) => {
                // @ts-expect-error This complains about there not being an index signature, which we are intentionally avoiding.
                global[id] = this.pubsubObject;
            });

        }
    }

    /* Execute all registered callbacks and resolve all pending promises related to a given trigger. */
    protected trigger<T extends keyof PubSub.ParameterlessTriggers<AllTriggers>>(key : T) : void;
    protected trigger<T extends keyof PubSub.ParameterTriggers<AllTriggers>>(key : T, ...args : AllTriggers[T] & any[]) : void;
    protected trigger<T extends keyof AllTriggers>(key : T, ...args : AllTriggers[T] & any[]) {
        // Resolve all promises.
        this.getTriggerSet(this.promises, key).forEach((resolve) => resolve(args));
        this.promises.delete(key);

        // Execute all callbacks.
        this.getTriggerSet(this.subscriptions, key).forEach((callback) => {
            if (args === undefined) {
                callback();
            } else {
                (callback as (...args : AllTriggers[T] & any[]) => void | Promise<void>)(...args);
            }
        });
    }

    /** Finalize the triggers and forward the callbacks and promises to a new component. */
    private finalizeTriggers(component : PubSub.PubSubObject<Triggers>) {
        if (this.finalized) {
            throw new Error("Already finalized.");
        }
        this.finalized = true;

        // Forward all promises.
        this.promises.forEach((promises, key) => {
            promises.forEach(async (resolve) => {
                resolve(await component.async[key]);
            });
        });

        // Register all callbacks.
        this.subscriptions.forEach((subscriptions, key) => {
            subscriptions.forEach((callback) => {
                // @ts-expect-error This complains about there not being an index signature, which we are intentionally avoiding.
                (component.sub[key as string] as (callback : VoidFunction) => void)(callback);
            });
        });

        // Clear held references.
        this.promises.clear();
        this.subscriptions.clear();
    }

    /** Returns the set that tracks the provided trigger key within a given set mapping. */
    private getTriggerSet<M>(map : Map<keyof AllTriggers, Set<M>>, key : keyof AllTriggers) {
        if (this.finalized) {
            throw new Error("Already finalized.");
        }

        let set = map.get(key);
        if (set === undefined) {
            set = new Set();
            map.set(key, set);
        }

        return set;
    }

    /** @returns A promise that resolves the next time the provided trigger executes. */
    private async triggerPromise<T extends keyof AllTriggers>(key : T) {
        return new Promise<AllTriggers[T]>((resolve) => {
            this.getTriggerSet(this.promises, key).add(resolve);
        });
    }

    /**
     * Register a callback that will be called each time the provided trigger executes.
     * Attempting to register the same callback will silently fail.
     */
    private triggerSubscribe<T extends keyof AllTriggers>(key : T, callback : AllTriggers[T] & VoidFunction) {
        this.getTriggerSet(this.subscriptions, key).add(callback);
    }

    /**
     * Remove a registered callback that will be called each time the provided trigger executes.
     * Does not throw an error if the callback is not previously registered.
     */
    private triggerUnsubscribe(key : keyof AllTriggers, callback : VoidFunction) {
        const set = this.getTriggerSet(this.subscriptions, key);
        set.delete(callback);

        if (set.size === 0) {
            this.subscriptions.delete(key);
        }
    }
}
