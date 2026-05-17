import type { Sub } from "../core";

export function onVisible<Msg>(toMsg: (now: number) => Msg): Sub<Msg> {
    return {
        key: "Visibility.onVisible",
        start: (dispatch) => {
            const handler = () => {
                if (document.visibilityState === "visible") {
                    dispatch(toMsg(Date.now()));
                }
            };
            document.addEventListener("visibilitychange", handler);
            return () => document.removeEventListener("visibilitychange", handler);
        },
    };
}