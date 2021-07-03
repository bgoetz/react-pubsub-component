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

import * from "react";
import { GlobalPubSub, PSComponent, PSLifecycleComponent } from "@bgoetz/react-pubsub-component";

const globalProvider = GlobalPubSub<PSParentSubs & PSLifecycleSubs>();

interface PSChildTriggers {
    /** Example trigger that doesn't require a parameter. */
    basicTrigger() : void;

    /** Example trigger that requires a parameter. */
    triggerWithParameters(event : React.SyntheticEvent<any, any> | Event) : void;
}
class PSChild extends PSComponent<{}, {}, PSChildTriggers> {
    public constructor(props : {}) {
        super(props);

        this.eventHandlerExample = this.eventHandlerExample.bind(this);
    }

    public render() {
        this.pub.basicTrigger();

        return <></>;
    }

    private eventHandlerExample(event : React.SyntheticEvent<any, any> | Event) {
        this.pub.triggerWithParameters(event);
    }
}

interface PSLifecycleSubs {
    childPSLifecycle : PSChildTriggers;
}
class PSLifecycleChild extends PSLifecycleComponent<{}, {}, PSChildTriggers> {
    public constructor(props : {}) {
        super(props);

        globalProvider.childPSLifecycle = this;
    }
}

interface PSParentSubs {
    childPS : PSChildTriggers;
}
export class PSParent extends PSComponent<{}, {}, {}, PSParentSubs> {
    public constructor(props : {}) {
        super(props);

        this.callback = this.callback.bind(this);
        this.generatorExample = this.generatorExample.bind(this);

        // Subscribe to the child pub/sub trigger.
        this.ps.childPS.sub.basicTrigger(this.callback);

        // Start up the generator.
        this.generatorExample();
    }

    public render() {
        // Note that, as of now, the key to define the property on `CCC` is not constrained by the actual keys of CCC.
        return <PSChild pubsub={[this.ps, "childPS" /*, globalProvider  */]} />;
    }

    private callback() {
        console.log("PUB/SUB: basicTrigger()");
    }

    /** Example using the `async` style for a generator. */
    private async generatorExample() {
        const { childPS: casx } = this.ps;
        if (casx === undefined) {
            return;
        }

        while (true) {
            const [ event ] = await this.ps.childPS.async.triggerWithParameters;

            console.log("PUB/SUB: triggerWithParameters()", event);
        }
    }
}

globalProvider.childPSLifecycle.sub.componentDidUpdate(() => {
    console.log("childPSLifecycle.componentDidUpdate()");
});
