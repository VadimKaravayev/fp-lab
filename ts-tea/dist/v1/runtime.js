// The TEA runtime. Holds the one piece of mutable state in the entire
// application (the current model) and drives the update → view → render
// loop. Everything else in the app is pure.
import { render } from "./h.js";
// Start a program. Mounts into `root`, renders the initial view, then
// runs the initial command. All subsequent changes flow through dispatch.
export function run(program, root) {
    // The only mutable binding in the whole app. Every other value flows
    // through pure functions.
    let model;
    // A message queue prevents re-entrant dispatch. If a command
    // synchronously dispatches a new message while we're still processing
    // the previous one, we enqueue it and handle it in the same loop
    // iteration instead of recursing. Async commands (fetch) never trigger
    // this because they dispatch after the current loop has exited.
    const queue = [];
    let processing = false;
    const dispatch = (msg) => {
        queue.push(msg);
        if (processing)
            return;
        processing = true;
        try {
            while (queue.length > 0) {
                const next = queue.shift();
                if (next === undefined)
                    break; // satisfies noUncheckedIndexedAccess
                const [newModel, cmd] = program.update(next, model);
                model = newModel;
                render(program.view(model), root, dispatch);
                cmd(dispatch);
            }
        }
        finally {
            processing = false;
        }
    };
    const [initialModel, initialCmd] = program.init();
    model = initialModel;
    render(program.view(model), root, dispatch);
    initialCmd(dispatch);
}
//# sourceMappingURL=runtime.js.map