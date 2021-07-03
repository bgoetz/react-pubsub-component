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

import { proxyGetter, proxySetter, PSComponent, PubSub } from "./ReactPubSubComponent";
import { PubSubProxy } from "./PubSubProxy";

/**
 * Create a new global service provider for pub/sub.
 * 
 * Register channels by adding any number of providers to the `pubsub` props array:
 * 
 * ```
 *   // Links to parent and also publishes to global service.
 *   const childPubSub = {};
 *   const componentA = <ExamplePS pubsub={[childPubSub, "componentA", globalA]} />;
 *   
 *   // Only publishes to two global services.
 *   const componentB = <ExamplePS pubsub={["componentB", globalB, globalC]} />;
 * ```
 * 
 * Subscribe to channels by name just as you would with local pub/sub:
 * 
 * ```
 *   this.ps.<channel>.sub.<trigger>(<handler>);
 *   globalA.<channel>.sub.<trigger>(<handler>);
 * ```
 */
export function GlobalPubSub<T extends PubSub.RestrictTriggerObjects<T>>() {
    // Build the proxy that allows for global pub/sub access. We don't want to require handilng partials, so we'll set up a
    // deferred registration mechanism for handlers and promises that will trigger / resolve when the channel is registered.
    return new Proxy({} as { [K : string] : any }, {
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
                    // @ts-expect-error This complains that `finalizeTriggers` is private, which we are intentionally avoiding.
                    (target[property] as PSComponent).finalizeTriggers(value);
                }
            }

            // Register the child.
            target[property] = value;

            return true;
        }),
    }) as PubSub.ChildSubsFromTriggersObject<T>;
}

interface Triggers {
    blah() : void;
    blah2(a : string) : void;
}

interface Child {
    child : Triggers;
}
