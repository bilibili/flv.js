import EventEmitter from 'events';

class BasePlayer {

    constructor(typeName) {
        this._type = typeName || 'undefined';
        this._emitter = new EventEmitter();
    }

    destroy() {
        this._emitter.removeAllListeners();
        this._emitter = null;
    }

    get type() {
        return this._type;
    }

    on(event, listener) {
        this._emitter.addListener(event, listener);
    }

    off(event, listener) {
        this._emitter.removeListener(event, listener);
    }

}

export default BasePlayer;