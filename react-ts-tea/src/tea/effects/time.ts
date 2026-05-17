import type { Sub } from "../core";

export function every<Msg>(ms: number, toMsg: (now: number) => Msg): Sub<Msg> {
    return {
        key: `Time.every:${ms}`,
        start: (dispatch) => {
            const handle = window.setInterval(() => dispatch(toMsg(Date.now())), ms);
            return () => window.clearInterval(handle);
        },
    };
}