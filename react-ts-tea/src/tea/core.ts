export type Runtime<M, Msg> = Readonly<{
    getModel: () => M;
    dispatch: (msg: Msg) => void;
    subscribe: (listener: () => void) => () => void;
    dispose: () => void;
}>;

export type Sub<Msg> = Readonly<{
    key: string;
    start: (dispatch: (msg: Msg) => void) => () => void;
}>;

export function run<M, Msg, Cmd>(
    init: () => [M, Cmd[]],
    update: (model: M, msg: Msg) => [M, Cmd[]],
    subscriptions: (model: M) => Sub<Msg>[],
    executeCmd: (cmd: Cmd, dispatch: (msg: Msg) => void) => void,
): Runtime<M, Msg> {
    const [initialModel, initialCmds] = init();
    let model = initialModel;
    const listeners = new Set<() => void>();
    let activeSubs: Array<{ key: string; stop: () => void }> = [];
    let disposed = false;

    function notify(): void {
        for (const l of listeners) l();
    }

    function dispatch(msg: Msg): void {
        if (disposed) return;
        const [nextModel, cmds] = update(model, msg);
        model = nextModel;
        for (const cmd of cmds) executeCmd(cmd, dispatch);
        syncSubs(subscriptions(model));
        notify();
    }

    function syncSubs(next: Sub<Msg>[]): void {
        const keep: typeof activeSubs = [];

        for (const active of activeSubs) {
            if (next.some((n) => n.key === active.key)) {
                keep.push(active);
            } else {
                active.stop();
            }
        }

        for (const n of next) {
            if (keep.some((k) => k.key === n.key)) continue;
            keep.push({ key: n.key, stop: n.start(dispatch) });
        }

        activeSubs = keep;
    }

    function subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }

    function dispose(): void {
        disposed = true;
        for (const active of activeSubs) active.stop();
        activeSubs = [];
        listeners.clear();
    }

    for (const cmd of initialCmds) executeCmd(cmd, dispatch);
    syncSubs(subscriptions(model));

    return {
        getModel: () => model,
        dispatch,
        subscribe,
        dispose,
    };
}
