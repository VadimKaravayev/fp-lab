import { executeCmd } from "./tea/executeCmd";
import { init } from "./tea/init";
import { subscriptions } from "./tea/subscriptions";
import { update } from "./tea/update";
import { view } from "./tea/view";
import { useProgram } from "./useProgram";
import "./App.css";

export function App() {
    const { viewState, dispatch } = useProgram(init, update, subscriptions, executeCmd, view);

    const onPrimary = () => {
        const now = Date.now();
        if (viewState.primaryAction === "start") dispatch({ type: "Start", now });
        else dispatch({ type: "Pause", now });
    };

    return (
        <div className="pomodoro">
            <h1>{viewState.phaseLabel}</h1>
            <div className="time">{viewState.timeText}</div>
            <progress value={viewState.progressPct} max={100} />
            <div className="controls">
                <button onClick={onPrimary}>{viewState.primaryLabel}</button>
                <button onClick={() => dispatch({ type: "Reset" })}>Reset</button>
            </div>
            <div className="completed">Completed: {viewState.completedWorkSessions}</div>
        </div>
    );
}

export default App;
