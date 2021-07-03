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

import { PSComponent } from "./PSComponent";
import type { PubSub } from "./ReactPubSubComponent";

/**
 * Identical to {@link PSComponent} where the React lifecycle methods are automatically triggered as messages.
 */
export class PSLifecycleComponent<P = {}, S = {}, Triggers extends PubSub.RestrictTriggers<Triggers> = {}, ChildSubs extends PubSub.RestrictTriggerObjects<ChildSubs> = {}, SS = any> extends PSComponent<P, S, Triggers, ChildSubs, SS> {
    /**
     * Called immediately after a component is mounted. Setting state here will trigger re-rendering.
     * 
     * NOTE: Not calling `super.componentDidMount()` will disable pub/sub triggering on this method!
     */
     public componentDidMount() {
        this.pub.componentDidMount();
    }

    /**
     * Called immediately after updating occurs. Not called for the initial render.
     *  
     * The snapshot is only present if getSnapshotBeforeUpdate is present and returns non-null.
     *
     * NOTE: Not calling `super.componentDidUpdate()` will disable pub/sub triggering on this method!
     */
    public componentDidUpdate() {
        this.pub.componentDidUpdate();
    }

    /**
     * Called immediately before a component is destroyed. Perform any necessary cleanup in this method, such as cancelled network
     * requests, or cleaning up any DOM elements created in `componentDidMount`.
     *
     * NOTE: Not calling `super.componentWillUnmount()` will disable pub/sub triggering on this method!
     */
    public componentWillUnmount() {
        this.pub.componentWillUnmount();
    }
}
