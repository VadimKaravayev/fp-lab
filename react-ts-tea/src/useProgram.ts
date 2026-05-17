import { useEffect, useState, useSyncExternalStore } from "react";
import { run, type Runtime, type Sub } from "./tea/core";

const noopSubscribe = () => () => {};
const noopDispatch = () => {};

export function useProgram<M, Msg, Cmd, V>(
    init: () => [M, Cmd[]],
    update: (model: M, msg: Msg) => [M, Cmd[]],
    subscriptions: (model: M) => Sub<Msg>[],
    executeCmd: (cmd: Cmd, dispatch: (msg: Msg) => void) => void,
    view: (model: M) => V,
): {
    viewState: V;
    dispatch: (msg: Msg) => void;
} {
    const [runtime, setRuntime] = useState<Runtime<M, Msg> | null>(null);
    const [fallbackModel] = useState<M>(() => init()[0]);

    useEffect(() => {
        const r = run(init, update, subscriptions, executeCmd);
        setRuntime(r);
        return () => {
            r.dispose();
            setRuntime(null);
        };
        // deps intentionally excluded — create once per mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const getSnapshot = runtime ? runtime.getModel : () => fallbackModel;

    const model = useSyncExternalStore(
        runtime?.subscribe ?? noopSubscribe,
        getSnapshot,
        getSnapshot,
    );

    return {
        viewState: view(model),
        dispatch: runtime?.dispatch ?? (noopDispatch as (msg: Msg) => void),
    };
}
