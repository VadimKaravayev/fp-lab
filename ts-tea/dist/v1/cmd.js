// Cmd<Msg> — a description of a side effect.
//
// A Cmd is an opaque "do this, and when it's done, dispatch a message".
// The simplest possible encoding is a thunk that closes over whatever it
// needs and calls `dispatch` when the effect resolves.
//
// The runtime never inspects a Cmd — it just calls it with dispatch. That
// means we can add new effect types (Http, Random, Time, ...) without
// touching runtime.ts at all.
// No side effect. Use this from `init` / `update` when there's nothing to
// do. `Cmd<never>` is assignable to `Cmd<Msg>` for any Msg, so `none` is
// polymorphic without needing a cast.
export const none = () => { };
// Run several commands sequentially. They all share the same dispatch,
// so every msg they produce ends up back in the loop.
export function batch(cmds) {
    return (dispatch) => {
        for (const cmd of cmds)
            cmd(dispatch);
    };
}
//# sourceMappingURL=cmd.js.map