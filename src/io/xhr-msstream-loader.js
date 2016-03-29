import Log from '../utils/logger.js';
import {BaseLoader, LoaderStatus, LoaderError} from './loader.js';

// For IE11/Edge browser by microsoft which supports `xhr.responseType = 'ms-stream'`
class MSStreamLoader extends BaseLoader {

    static isSupported() {
        try {
            if (typeof self.MSStream === 'undefined' || typeof self.MSStreamReader === 'undefined') {
                return false;
            }

            let xhr = new XMLHttpRequest();
            xhr.open('GET', 'https://example.com', true);
            xhr.responseType = 'ms-stream';
            return (xhr.responseType === 'ms-stream');
        } catch (e) {
            Log.w('MSStreamLoader', e.message);
            return false;
        }
    }

    constructor() {
        super('xhr-msstream-loader');
        this.TAG = this.constructor.name;

        this._xhr = null;
        this._reader = null;  // MSStreamReader

        this._totalRange = null;
        this._currentRange = null;

        this._contentLength = null;
        this._receivedLength = 0;

        this._bufferLimit = 16 * 1024 * 1024;  // 16MB
        this._lastTimeBufferSize = 0;
        this._isReconnecting = false;
    }

    destroy() {
        if (this.isWorking()) {
            this.abort();
        }
        if (this._reader) {
            this._reader.onprogress = null;
            this._reader.onload = null;
            this._reader.onerror = null;
            this._reader = null;
        }
        if (this._xhr) {
            this._xhr.onreadystatechange = null;
            this._xhr = null;
        }
        super.destroy();
    }

    open(url, range) {
        this._internalOpen(url, range, false);
    }

    _internalOpen(url, range, isSubrange) {
        this._url = url;

        if (!isSubrange) {
            this._totalRange = range;
        } else {
            this._currentRange = range;
        }

        let reader = this._reader = new self.MSStreamReader();
        reader.onprogress = this._msrOnProgress.bind(this);
        reader.onload = this._msrOnLoad.bind(this);
        reader.onerror = this._msrOnError.bind(this);
 
        let xhr = this._xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'ms-stream';
        xhr.onreadystatechange = this._xhrOnReadyStateChange.bind(this);
        xhr.onerror = this._xhrOnError.bind(this);

        if (range.from !== 0 || range.to !== -1) {
            let param;
            if (range.to !== -1) {
                param = `bytes=${range.from.toString()}-${range.to.toString()}`;
            } else {
                param = `bytes=${range.from.toString()}-`;
            }
            xhr.setRequestHeader('Range', param);
        }

        if (this._isReconnecting) {
            this._isReconnecting = false;
        } else {
            this._status = LoaderStatus.kConnecting;
        }
        xhr.send();
    }

    abort() {
        this._internalAbort();
        this._status = LoaderStatus.kComplete;
    }

    _internalAbort() {
        if (this._reader) {
            if (this._reader.readyState === 1) {  // LOADING
                this._reader.abort();
            }
            this._reader.onprogress = null;
            this._reader.onload = null;
            this._reader.onerror = null;
            this._reader = null;
        }
        if (this._xhr) {
            this._xhr.abort();
            this._xhr.onreadystatechange = null;
            this._xhr = null;
        }
    }

    _xhrOnReadyStateChange(e) {
        let xhr = e.target;

        if (xhr.readyState === 3) {
            if (xhr.status >= 200 && xhr.status <= 299) {
                this._status = LoaderStatus.kBuffering;

                let lengthHeader = xhr.getResponseHeader('Content-Length');
                if (lengthHeader != null && this._contentLength == null) {
                    let length = parseInt(lengthHeader);
                    if (length > 0) {
                        this._contentLength = length;
                        if (this._onContentLengthKnown) {
                            this._onContentLengthKnown(this._contentLength);
                        }
                    }
                }

                let msstream = xhr.response;
                this._reader.readAsArrayBuffer(msstream);
            } else {
                this._status = LoaderStatus.kError;
                if (this._onError) {
                    this._onError(LoaderError.kHttpStatusCodeInvalid, {code: xhr.status, msg: xhr.statusText});
                } else {
                    throw 'MSStreamLoader: Http code invalid, ' + xhr.status + ' ' + xhr.statusText;
                }
            }
        }
    }

    _xhrOnError(e) {
        this._status = LoaderStatus.kError;
        let type = LoaderError.kException;
        let info = {code: -1, msg: e.constructor.name + ' ' + e.type};

        if (this._onError) {
            this._onError(type, info);
        } else {
            throw info.msg;
        }
    }

    _msrOnProgress(e) {
        let reader = e.target;
        let bigbuffer = reader.result;
        if (bigbuffer == null) {  // result may be null, workaround for buggy M$
            this._doReconnectIfNeeded();
            return;
        }

        let slice = bigbuffer.slice(this._lastTimeBufferSize);
        this._lastTimeBufferSize = bigbuffer.byteLength;
        let byteStart = this._totalRange.from + this._receivedLength;
        this._receivedLength += slice.byteLength;

        if (this._onDataArrival) {
            this._onDataArrival(slice, byteStart, this._receivedLength);
        }

        Log.v(this.TAG, `Received Chunk, size = ${slice.byteLength}, total_received = ${this._receivedLength}`);

        if (bigbuffer.byteLength >= this._bufferLimit) {
            Log.v(this.TAG, 'MSStream buffer exceeded max size, reconnecting...');
            this._doReconnectIfNeeded();
        }
    }

    _doReconnectIfNeeded() {
        if (this._contentLength == null || this._receivedLength < this._contentLength) {
            this._isReconnecting = true;
            this._lastTimeBufferSize = 0;
            this._internalAbort();

            let range = {
                from: this._totalRange.from + this._receivedLength,
                to: -1
            };
            this._internalOpen(this._url, range, true);
        }
    }

    _msrOnLoad(e) {  // actually it is onComplete event
        this._status = LoaderStatus.kComplete;
        if (this._onComplete) {
            this._onComplete(this._totalRange.from, this._totalRange.from + this._receivedLength - 1);
        }
    }

    _msrOnError(e) {
        this._status = LoaderStatus.kError;
        let type = 0;
        let info = null;

        if (this._contentLength && this._receivedLength < this._contentLength) {
            type = LoaderError.kEarlyEof;
            info = {code: -1, msg: 'MSStream meet Early-Eof'};
        } else {
            type = LoaderError.kException;
            info = {code: -1, msg: e.constructor.name + ' ' + e.type};
        }

        if (this._onError) {
            this._onError(type, info);
        } else {
            throw info.msg;
        }
    }
}

export default MSStreamLoader;