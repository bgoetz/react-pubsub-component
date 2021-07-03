# React Pub/Sub Component

This is an extension to `React.Component` to allow for pub/sub messaging. Components are able to trigger messages to any number
of subscribers, without explicit knowledge of their subscribers. Unlike Redux, this moves pub/sub messaging to the lowest necessary
levels, according to React principles, while also providing access to global pub/sub providers as an option on an as-needed basis.

It is recommended to use TypeScript to enable user-friendly guarding against available components and messages, however this is not
required. See [Advanced Usage (TypeScript)](#advanced-usage-typescript) for details.

See `example/PubSubExample` for a complete example.

*Note: This uses [Proxies](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) under the hood.
There is a moderate performance cost to this, so in cases where extreme performance is necessary (>10m messages per sec) it is
recommended to use a dedicated pub/sub mechanism. However, as of NodeJS v14, Proxies are performant enough for modern UI/UX development.*



<a name="toc"></a>

## Table of Contents

 * [Quick Referencee](#quick-reference)  
 * [Basic Usage](#basic-usage)  
   * [React Component Lifecycle](#react-component-lifecycle)
   * [Subscriptions](#subscriptions)
 * [Global Pub/Sub](#global-pubsub)
 * [Advanced Usage (TypeScript)](#advanced-usage-typescript)
   * [Global Pub/Sub (TypeScript)](#global-pubsub-typescript)
 * [License (MIT)](#license-mit)



<a name="quick-reference"></a>

# Quick Reference

[Back to Top](#table-of-contents)

Available components:

 * ```typescript
    // No React lifecyle methods. 
    type PSComponent<Props, State, Triggers, ChildPubs, SS>;
   ```
 * ```typescript
    // Includes lifecyle methods. 
    type PSLifecycleComponent<Props, State, Triggers, ChildPubs, SS>;
   ```
 * ```typescript
    // No React lifecyle methods. Snapshot before Triggers.
    type PSComponentSS<Props, State, SS, Triggers, ChildPubs>;
   ```
 * ```typescript
    // Includes lifecyle methods. Snapshot before Triggers.
    type PSLifecycleComponentSS<Props, State, SS, Triggers, ChildPubs>;
   ```

Trigger messages from within a `PSComponent`:
```javascript
this.pub.<message>(...args);
```

Subscribe to messages from a parent `PSComponent`:
```javascript
await this.ps.<child>.async.<message>;    // Not a function!
this.ps.<child>.sub.<message>(handler);   // Subscribe.
this.ps.<child>.unsub.<message>(handler); // Unsubscribe.
```

Use global providers:
```javascript
// Create provider. //
const provider = PubSubGlobal();

// Registration //

class PSComponent {
    constructor(props) {
        // ...

        provider.component = this.pubsubObject;
    }
}

<PSComponent pubsub={["component", provider, ...additionalProviders]} />;
<PSComponent pubsub={[this.ps, "component", provider, ...additionalProviders]} />;

// Consumption //

await provider.<component>.async.<message>;    // Not a function!
provider.<component>.sub.<message>(handler);   // Subscribe.
provider.<component>.unsub.<message>(handler); // Unsubscribe.
```


<a name="basic-usage"></a>

# Basic Usage

[Back to Top](#table-of-contents)


In any instance where you would use `React.Component` you can instead use `ReactPubSub.PSComponent`:

```javascript
import * from "react";

class Example extends React.Component {
    // ...
}

import { PSComponent } from "@bgoetz/react-pubsub-component";

class ExamplePS extends PSComponent {
    // ...
}

// These are functionally equivalent for non-pub/sub.
const example = <Example />;
const examplePS = <ExamplePS />;
```

To trigger a message use `this.pub.<messageId>`. You can pass whatever arguments you want along with the message:

```javascript
class ExamplePS extends PSComponent {
    messageA() {
        this.pub.example();
    }

    messageB(...args) {
        this.pub.exampleWithArgs(...args);
    }
}
```



<a name="react-component-lifecycle"></a>

## React Component Lifecycle

[Back to Top](#table-of-contents)


If you want to have the React component lifecycle methods trigger a message when they are called, inherit from `PSLifecycleComponent`
instead of `PSComponent`. Be sure to call `super.<method>()` or the message will not trigger. You can also intentionally skip this to
remove pub/sub for that lifecycle method if it is unneeded.

```javascript
class Child extends PSLifecycleComponent {
    componentDidMount() {
        super.componentDidMount();

        // ...
    }

    componentDidUpdate() {
        // Remove message triggering.
    }
}
```

-  `componentDidMount()` will trigger with the message id `componentDidMount`
-  `componentDidUpdate()` will trigger with the message id `componentDidUpdate`
-  `componentWillUnmount()` will trigger with the message id `componentWillUnmount`



<a name="subscriptions"></a>

## Subscriptions

[Back to Top](#table-of-contents)


To enable subscribing, you must pass an object to the optional component property `pubsub` along with the label for the child.

```javascript
const childPubSub = {};
const component = <ExamplePS pubsub={[childPubSub, "child"]} />;
```

You can now subscribe to triggers as well as generate yielding promises. Duplicate subscriptions (same handler and same message id)
will be ignored. Unsubscribing a non-registered handler will be ignored. Note: The `PSComponent` constructor must be run before
you can subscribe to child pub/sub channels. This is not an issue if you are using `ps` (see next section).

```javascript
function handler() {
    // ...
}

// Fetch a promise that will resolve the next time the "example" message is triggered by the PSComponent "child".
childPubSub.child.async.example; // NOTE: Not a function!

// Subscribe to the "example" message from the PSComponent "child".
childPubSub.child.sub.example(handler);

// Unsubscribe from the "example" message from the PSComponent "child".
childPubSub.child.unsub.example(handler);
```

Every `PSComponent` has a property `ps` that is purpose built for tracking all child `PSComponent` objects. It is recommended that
any React component subscribing to messages from a child `PSComponent` also be a `PSComponent`. In this case, the usage is simpler:

```javascript
import * from "react";
import { PSComponent } from "@bgoetz/react-pubsub-component";

class Child extends PSLifecycleComponent {
    private func() {
        // Trigger the message "example".
        this.pub.example();
    }
}

class Parent extends PSComponent {
    constructor(props) {
        super(props);

        // Subscribe to the message "example".
        const { child } = this.ps;
        child.sub.example(this.handler.bind(this));

        // These two have the same effect.
        child.sub.componentDidUpdate(this.childUpdated.bind(this, "sub"));
        this.watchdog();
    }

    render() {
        return <Child pubsub={[this.ps, "child"]} />
    }

    // Called whenever the message "example" is triggered by the "child" `PSComponent`.
    handler() {
        // ...
    }

    // Example for yielding promise generator.
    async watchdog() {
        while (true) {
            await this.ps.child.async.componentDidUpdate; // Not a function!
            this.childUpdated("async");
        }
    }

    childUpdated(source) {
        console.log("Child updated!", source);
    }
}
```

It doesn't matter if you subscribe to a component before the parent/child relationship is formally linked. `this.ps` will
automatically forward all subscriptions and pending promises to the child `PSComponent` whenever it is linked. This will also
happen if a new `PSComponent` tries to register with the same parent. Note that if this happens, the previous `PSComponent` triggers
will never result in a message propogating to subscribers. However, so long as you don't cache explicit references to the child
components outside the immediate scope of extracting from `this.ps`, this will not be an issue.



<a name="global-pubsub"></a>

# Global Pub/Sub

[Back to Top](#table-of-contents)


You can also register a `PSComponent` with global pub/sub providers. This will allow consumption of messages from components that
aren't a direct child of the consumer. To do this, add the global provider objects to the `pubsub` prop. You can register a component
solely with the global service by excluding the linking object. You can also register a component with a global provider from within
its constructor by using its `pubsubObject` field.

```javascript
import { GlobalPubSub } from "@bgoetz/react-pubsub-component";

// Create a new global provider.
const globalProvider = GlobalPubSub();

// Registers with both the parent and the global provider.
const componentA = <ExamplePS pubsub={[this.ps, "componentA", globalProvider /* , ...additionalProviders */]} />;

// Registers with only the global provider.
const componentB = <ExamplePS pubsub={["componentB", globalProvider /* , ...additionalProviders */]} />;

// Registers with the global provider from within the constructor. Recommended for global-only registering.
class ComponentC extends PSComponent {
    constructor(props) {
        super(props);

        globalProvider.componentC = this.pubsubObject;
    }
}
```
Global providers hold references to each `PSComponent`, so you can interact with them as you would if they were registered locally.

```javascript
// Identical to `this.ps.componentA.async.messageA`
await globalProvider.componentA.async.messageA;

// Only available globally. Set from parent.
globalProvider.componentB.sub.messageB(callback);

// Only available globally. Set in constructor.
globalProvider.componentC.unsub.messageC(callback);
```

You cannot reuse the same ID across two separate components. There will be no warning or error issued, but all handlers and pending
promises will be forwarded to the latest registered `PSComponent`. Because of this, it is recommended to only register with the
global pub/sub service and not enable local linking unless you are certain the component will only be rendered once within the DOM
at any point in time.



<a name="advanced-usage-typescript"></a>

# Advanced Usage (TypeScript)

[Back to Top](#table-of-contents)


There are two additional optional type parameters that are added to `React.Component`: `Triggers` and `ChildSubs`. These are
inserted between the `State` and `SnapShot` generic parameters:

```typescript
declare abstract class PSComponent<P = {}, S = {}, Triggers = {}, ChildSubs = {}, SS = any> {
    // ...
}
```

Just as you provide an interface for the `Props` and `State` of a React component, you can also provide the message triggers. These
must be functions that return `void`.

```typescript
interface Props {
    // ...
}
interface State {
    // ...
}
interface Triggers {
    /** This JSDoc will propogate. */
    messageA() : void;
    messageB(arg : string) : void;
}

class ComponentA extends PSComponent<Props, State, Triggers> {
    public func() {
        this.pub.messageA();
        this.pub.messageB("Hello world!");
    }
}

// You can pass an empty object as a type parameter if you don't need to describe the props and/or state.
class ComponentB extends PSComponent<{}, {}, Triggers> {
    // ...
}
```

The `ChildPubs` generic parameter is used for local linking to identify the label and triggers for a given child pub/sub object:

```typescript
interface ChildPubs {
    child : Triggers; // From above.
}
class Parent extends PSComponent<{}, {}, {}, ChildPubs> {
    public constructor(props : {}) {
        super(props);

        const { child } = this.ps;
        child.sub.messageB(this.func.bind(this));
    }

    public func(message : string) {
        console.log(message); // Hello world!
    }
}
```

If you prefer to move the additional parameters to the end (after React snapshots), you can use `PSComponentSS` and `PSLifecycleComponentSS`:

```typescript
class ExampleSS extends PSComponentSS<Props, State, SS, Triggers, ChildPubs> {
    // ...
}
```



<a name="global-pubsub-typescript"></a>

## Global Pub/Sub (TypeScript)

[Back to Top](#table-of-contents)


`GlobalPubSub` takes a generic parameter of the same type as `ChildSubs` above. This allows for typechecking against available
pub/sub channels.

```typescript
const globalProvider = GlobalPubSub<ChildPubs>();

function handler(message : string) {
    console.log(message); // Hello world!
}

// Subscribe to a message.
globalProvider.child.sub.messageB(handler);
```



<a name="license-mit"></a>

# License (MIT)

[Back to Top](#table-of-contents)


    Copyright (c) 2021 Ben Goetz

    Permission is hereby granted, free of charge, to any person obtaining
    a copy of this software and associated documentation files (the
    "Software"), to deal in the Software without restriction, including
    without limitation the rights to use, copy, modify, merge, publish,
    distribute, sublicense, and/or sell copies of the Software, and to
    permit persons to whom the Software is furnished to do so, subject to
    the following conditions:

    The above copyright notice and this permission notice shall be
    included in all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
    EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
    MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
    NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
    LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
    OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
    WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.