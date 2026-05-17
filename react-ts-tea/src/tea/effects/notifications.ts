export function send(title: string, body: string): void {
    if (!("Notification" in window)) {
        console.log("[Notifications.send]", title, body);
        return;
    }
    if (Notification.permission === "granted") {
        new Notification(title, { body });
        return;
    }
    if (Notification.permission === "default") {
        void Notification.requestPermission().then((perm) => {
            if (perm === "granted") new Notification(title, { body });
            else console.log("[Notifications.send]", title, body);
        });
        return;
    }
    console.log("[Notifications.send]", title, body);
}