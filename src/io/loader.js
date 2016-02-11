export const LoaderStatus = {
    kIdle: 0,
    kConnecting: 1,
    kBuffering: 2,
    kError: 3,
    kEarlyEof: 4,
    kComplete: 5
};

export const LoaderError = {
    kOK: 0,
    kException: 1,
    kHttpStatusCodeInvalid: 2,
    kConnectingTimeout: 3,
    kEarlyEof: 4
};

export class BaseLoader {

    constructor(typeName) {
        this._type = typeName || 'undefined';
        this._status = LoaderStatus.kIdle;
        // callbacks
        this._onDataArrival = null;
        this._onError = null;
        this._onComplete = null;
    }

    destroy() {
        this._status = LoaderStatus.kIdle;
        this._onDataArrival = null;
        this._onError = null;
        this._onComplete = null;
    }

    get type() {
        return this._type;
    }

    get status() {
        return this._status;
    }

    get onDataArrival() {
        return this._onDataArrival;
    }

    set onDataArrival(callback) {
        if (typeof callback !== 'function') {
            throw 'onDataArrival must be a callback function!';
        }

        this._onDataArrival = callback;
    }

    get onError() {
        return this._onError;
    }

    set onError(callback) {
        if (typeof callback !== 'function') {
            throw 'onError must be a callback function!';
        }

        this._onError = callback;
    }

    get onComplete() {
        return this._onComplete;
    }

    set onComplete(callback) {
        if (typeof callback !== 'function') {
            throw 'onComplete must be a callback function!';
        }

        this._onComplete = callback;
    }

    // pure virtual
    open(url, range) {
        throw 'Unimplemented abstract function!';
    }

    abort() {
        throw 'Unimplemented abstract function!';
    }


}