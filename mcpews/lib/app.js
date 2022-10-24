const EventEmitter = require("events");
const WSServer = require("./server");

const ERRORCODE_MASK = 1 << 31;

function waitForEvent(emitter, eventName, timeout, filter) {
    return new Promise((resolve, reject) => {
        const listener = (event) => {
            if (filter && !filter(event)) return;
            resolve(event);
            emitter.removeListener(eventName, listener);
        };
        emitter.addListener(eventName, listener);
        if (timeout) {
            setTimeout(() => {
                emitter.removeListener(eventName, listener);
                reject(new Error(`${eventName}: Timeout ${timeout} exceed.`));
            }, timeout);
        }
    });
}

const kWrappedListener = Symbol("wrappedListener");
function wrapListener(listener, wrapper) {
    const cached = listener[kWrappedListener];
    if (cached) return cached;
    if (wrapper) {
        const wrapped = wrapper(listener);
        listener[kWrappedListener] = wrapped;
        return wrapped;
    }
    return null;
}

class AppSession {
    constructor(app, internalSession) {
        this.app = app;
        this.internalSession = internalSession;
    }

    enableEncryption() {
        return new Promise((resolve) => {
            this.internalSession.enableEncryption(resolve);
        });
    }

    isEncrypted() {
        return this.internalSession.isEncrypted();
    }

    on(event, listener) {
        const wrapped = wrapListener(listener, (l) => l.bind(this));
        if (event === "Disconnect") {
            this.internalSession.on("disconnect", wrapped);
        } else {
            this.internalSession.subscribe(event, wrapped);
        }
        return this;
    }

    once(event, listener) {
        const holderListener = function doNothing() {}; // used to delay the unsubscribe request
        const wrappedListener = function wrapped(e) {
            this.off(event, wrappedListener);
            listener.call(this, e);
            this.off(event, holderListener);
        };
        this.on(event, wrappedListener);
        this.on(event, holderListener);
        return this;
    }

    off(event, listener) {
        const wrapped = wrapListener(listener);
        if (wrapped) {
            this.internalSession.unsubscribe(event, wrapped);
        }
        return this;
    }

    addListener(event, listener) {
        return this.on(event, listener);
    }

    removeListener(event, listener) {
        return this.off(event, listener);
    }

    waitForEvent(event, timeout, filter) {
        return waitForEvent(this, event, timeout, filter);
    }

    withCatch(executor, timeout) {
        return new Promise((resolve, reject) => {
            let errorFrameCallback;
            let errorCallback;
            let timeoutId;
            const callback = (success, valueOrError) => {
                this.internalSession.off("mcError", errorFrameCallback);
                this.internalSession.off("error", errorCallback);
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                if (success) {
                    resolve(valueOrError);
                } else {
                    reject(valueOrError);
                }
            };
            errorCallback = (error) => callback(false, error);
            errorFrameCallback = (frame) => callback(false, new Error(frame.statusMessage));
            this.internalSession.once("mcError", errorFrameCallback);
            this.internalSession.once("error", reject);
            if (timeoutId > 0) {
                timeoutId = setTimeout(() => callback(false, new Error(`Timeout ${timeout} exceed.`)), timeout);
            }
            try {
                executor.call(
                    this,
                    (value) => callback(true, value),
                    (reason) => callback(false, reason)
                );
            } catch (err) {
                callback(false, err);
            }
        });
    }

    command(command, timeout) {
        return this.withCatch((resolve, reject) => {
            this.internalSession.sendCommand(command, (event) => {
                if ((event.body.statusCode & ERRORCODE_MASK) === 0) {
                    resolve(event);
                } else {
                    reject(new Error(event.body.statusMessage));
                }
            });
        }, timeout);
    }

    commandLegacy(commandName, overload, input, timeout) {
        return this.withCatch((resolve, reject) => {
            this.internalSession.sendCommandLegacy(commandName, overload, input, (event) => {
                if ((event.body.statusCode & ERRORCODE_MASK) === 0) {
                    resolve(event);
                } else {
                    reject(new Error(event.body.statusMessage));
                }
            });
        }, timeout);
    }

    disconnect(timeout) {
        this.internalSession.disconnect();
        return waitForEvent(this.internalSession, "disconnect", timeout);
    }
}

function onSession({ session }) {
    const appSession = new AppSession(this, session);
    this.sessions.push(appSession);
    this.emit("session", appSession);
    session.on("disconnect", () => {
        const sessionIndex = this.sessions.indexOf(session);
        if (sessionIndex >= 0) {
            this.sessions.splice(sessionIndex, 1);
        }
    });
}

class WSApp extends EventEmitter {
    constructor(port, handleSession) {
        super();
        this.internalServer = new WSServer(port, onSession.bind(this));
        this.sessions = [];
        if (handleSession) {
            this.on("session", handleSession);
        }
    }

    async forEachSession(f) {
        await Promise.all(this.sessions.map(f));
    }

    async mapSession(f) {
        return Promise.all(this.sessions.map(f));
    }

    waitForSession(timeout) {
        return waitForEvent(this, "session", timeout);
    }
}

module.exports = WSApp;
