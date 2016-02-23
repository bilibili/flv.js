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

/* Loader has callbacks which have following prototypes:
 *     function onContentLengthKnown(contentLength: number): void
 *     function onDataArrival(chunk: ArrayBuffer, byteStart: number, receivedLength: number): void
 *     function onError(errorType: number, errorInfo: {code: number, msg: string}): void
 *     function onComplete(rangeFrom: number, rangeTo: number): void
 */
export class BaseLoader {

    constructor(typeName) {
        this._type = typeName || 'undefined';
        this._status = LoaderStatus.kIdle;
        // callbacks
        this._onContentLengthKnown = null;
        this._onDataArrival = null;
        this._onError = null;
        this._onComplete = null;
    }

    destroy() {
        this._status = LoaderStatus.kIdle;
        this._onContentLengthKnown = null;
        this._onDataArrival = null;
        this._onError = null;
        this._onComplete = null;
    }

    isWorking() {
        return this._status === LoaderStatus.kConnecting || this._status === LoaderStatus.kBuffering;
    }

    get type() {
        return this._type;
    }

    get status() {
        return this._status;
    }

    get onContentLengthKnown() {
        return this._onContentLengthKnown;
    }

    set onContentLengthKnown(callback) {
        if (typeof callback !== 'function') {
            throw 'onContentLengthKnown must be a callback function!';
        }

        this._onContentLengthKnown = callback;
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