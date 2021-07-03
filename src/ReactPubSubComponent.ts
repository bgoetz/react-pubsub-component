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

import type { PSComponent, PubSubTriggers } from "./PSComponent";
import type { PSLifecycleComponent } from "./PSLifecycleComponent";
export type { PubSubTriggers } from "./PSComponent";

export { PSComponent } from "./PSComponent";
export { PSLifecycleComponent } from "./PSLifecycleComponent";
export { GlobalPubSub } from "./GlobalPubSub";

export type PSComponentSS<P = {}, S = {}, SS = any, Triggers extends PubSub.RestrictTriggers<Triggers> = {}, ChildSubs extends PubSub.RestrictTriggerObjects<ChildSubs> = {}> = PSComponent<P, S, Triggers, ChildSubs, SS>;
export type PSLifecycleComponentSS<P = {}, S = {}, SS = any, Triggers extends PubSub.RestrictTriggers<Triggers> = {}, ChildSubs extends PubSub.RestrictTriggerObjects<ChildSubs> = {}> = PSLifecycleComponent<P, S, Triggers, ChildSubs, SS>;

export namespace PubSub {
    /** Removes all methods on an interface that have parameters. */
    export type ParameterlessTriggers<T> = { [K in keyof T] : T[K] extends void | (() => void) ? K : never };
    /** Removes all methods on an interface that do not have any parameters. */
    export type ParameterTriggers<T> = { [K in keyof T] : T[K] extends void | (() => void) ? never : K };

    /** Any function with any parameters that returns `void`. */
    // We add `Promise<void>` as `(...) => void` matches all possible returns using `RestrictProperties`.
    export type VoidFunction = (...args : any[]) => void | Promise<void>;
    export type VoidParameters<T extends VoidFunction> = T extends (...args : infer P) => void | Promise<void> ? P : never;

    /** Preserves {@link VoidFunction} properties, and removes all others. */
    export type Triggerable<T> = {
        // Get only named properties.
        [K in keyof T as string extends K ? never : number extends K ? never : K] :
            // Restrict to `(...) => void | Promise<void>`.
            T[K] extends VoidFunction ? T[K] : never
    };
    /** Converts all {@link Triggerable} properties to allow for simple subscribe / unsubscribe actions. */
    export type Subscribable<T, TT = Triggerable<T>> = { [key in keyof TT] : (callback : TT[key]) => void };
    /** Converts all {@link Triggerable} properties into promise generators. */
    export type Awaitable<T, TT = Triggerable<T>> = {
        [key in keyof TT] : TT[key] extends VoidFunction ? Promise<VoidParameters<TT[key]>> : Promise<void>
    };

    /** Remove all properties from an interface that do not match the given type. */
    export type RestrictProperties<T, ET> = { [K in keyof T as string extends K ? never : number extends K ? never : K] : T[K] extends ET ? ET : never };
    /** Require all properties on the given interface to be {@link VoidFunction}. */
    export type RestrictTriggers<T> = RestrictProperties<T, VoidFunction>;
    /** Require all properties on the given interface to be a {@link RestrictTriggers} object. */
    export type RestrictTriggerObjects<T> = { [K in keyof T as string extends K ? never : number extends K ? never : K] : T[K] extends RestrictTriggers<T[K]> ? T[K] : never };

    /** The extracted public properties of {@link PubSubComponent}. */
    export interface PubSubObject<T extends RestrictTriggers<T> = {}, TT = PubSubTriggers & T> {
        /** Allows parents to get pub/sub promises. See: {@link PubSubComponent.async}. */
        async : Awaitable<TT>;

        /** Allows parents to subscribe to triggers. See: {@link PubSubComponent.sub}. */
        sub : Subscribable<TT>;

        /** Allows parents to unsubscribe to triggers. See: {@link PubSubComponent.unsub}. */
        unsub : Subscribable<TT>;
    }
    /**
     * Remaps the types of all properties that are {@link RestrictTriggerObjects} to be {@link PubSubObject PubSubObjects}.
     * Simplifies generic type parameters when passing trigger objects to {@link PSComponent}.
     */
    export type ChildSubsFromTriggersObject<T extends RestrictTriggerObjects<T>> = { [K in keyof T] : T[K] extends RestrictTriggers<T[K]> ? PubSubObject<T[K]> : never };
}

type ProxyGetterCallback<T extends {}, V> = (target : T, property : string) => V;
type ProxySetterCallback<T extends {}, V> = (target : T, property : string, value : V) => boolean;
type ProxyHandlerGet<T> = (target : T, property : string | symbol, receiver : any) => any;
type ProxyHandlerSet<T, V> = (target : T, property : string | symbol, value : V, receiver : any) => any;

/** Generates the `get` trap for a Proxy object. */
export function proxyGetter<T extends {}, V>(callback : ProxyGetterCallback<T, V>) : ProxyHandlerGet<T> {
    return (target : T, property : string | symbol, _receiver : any) => {
        if (typeof property !== "string") {
            throw new Error("String access required for pub/sub.");
        }

        return (callback as ProxyGetterCallback<T, V>)(target, property);
    };
}

/** Generates the `set` trap for a Proxy object. */
export function proxySetter<T extends {}, V>(callback : ProxySetterCallback<T, V>) : ProxyHandlerSet<T, V> {
    return (target : T, property : string | symbol, value : V, _receiver : any) => {
        if (typeof property !== "string") {
            throw new Error("String access required for pub/sub.");
        }

        return (callback as ProxySetterCallback<T, V>)(target, property, value);
    };
}

export function simpleProxy<P, T = any, V = any>(callback : ProxyGetterCallback<T, V>) {
    return new Proxy({}, {
        get : proxyGetter(callback),
    }) as P;
}
