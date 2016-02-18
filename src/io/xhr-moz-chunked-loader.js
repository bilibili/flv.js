import {BaseLoader, LoaderStatus, LoaderError} from './loader.js';

// For FireFox browser which supports `xhr.responseType = 'moz-chunked-arraybuffer'`
class MozChunkedLoader extends BaseLoader {

    static isSupported() {
        try {
            let xhr = new XMLHttpRequest();
            // Firefox 37- requires .open() to be called before setting responseType
            xhr.open('GET', 'https://example.com', true);
            xhr.responseType = 'moz-chunked-arraybuffer';
            return (xhr.responseType === 'moz-chunked-arraybuffer');
        } catch (e) {
            return false;
        }
    }

    constructor() {
        super('xhr-moz-chunked');
        this._xhr = null;
        this._requestAbort = false;
        this._totalLength = null;
        this._receivedLength = 0;
    }

    destroy() {
        if (this.isWorking()) {
            this.abort();
        }
        this._xhr = null;
        super.destroy();
    }

    open(url, range) {
        this._url = url;
        this._range = range;

        let xhr = this._xhr = new XMLHttpRequest();

        xhr.open('GET', url, true);
        xhr.responseType = 'moz-chunked-arraybuffer';
        xhr.onreadystatechange = this._onReadyStateChange.bind(this);
        xhr.onprogress = this._onProgress.bind(this);
        xhr.onloadend = this._onLoadEnd.bind(this);
        xhr.ontimeout = this._onTimeout.bind(this);
        xhr.onerror = this._onError.bind(this);

        if (range.from !== 0 || range.to !== -1) {
            let param;
            if (range.to !== -1) {
                param = 'bytes=' + range.from.toString() + '-' + range.to.toString();
            } else {
                param = 'bytes=' + range.from.toString() + '-';
            }
            xhr.setRequestHeader('Range', param);
        }

        this._status = LoaderStatus.kConnecting;
        xhr.send();
    }

    abort() {
        this._requestAbort = true;
        if (this._xhr) {
            this._xhr.abort();
        }
        this._status = LoaderStatus.kComplete;
    }

    _onReadyStateChange(e) {
        let xhr = e.target;

        if (xhr.readyState === 2) {  // HEADERS_RECEIVED
            if (xhr.status !== 200 && xhr.status !== 206) {
                this._status = LoaderStatus.kError;
                if (this._onError) {
                    this._onError(LoaderError.kHttpStatusCodeInvalid, {code: xhr.status, msg: xhr.statusText});
                } else {
                    throw 'MozChunkedLoader: Http code invalid, ' + xhr.status + ' ' + xhr.statusText;
                }
            } else {
                this._status = LoaderStatus.kBuffering;
            }
        }
    }

    _onProgress(e) {
        let xhr = e.target;

        if (this._totalLength === null) {
            if (xhr.total !== 0) {
                this._totalLength = xhr.total;
            }
        }

        let chunk = xhr.response;
        let byteStart = this._range.from + this._receivedLength;
        this._receivedLength += chunk.byteLength;

        console.log('MozChunkedLoader: received chunk, size = ' + chunk.byteLength + ', total_received = ' + this._receivedLength);

        if (this._onDataArrival) {
            this._onDataArrival(chunk, byteStart, this._receivedLength);
        }
    }

    _onLoadEnd(e) {
        if (this._requestAbort === true) {
            this._requestAbort = false;
            return;
        }
        this._status = LoaderStatus.kComplete;
        if (this._onComplete) {
            this._onComplete(this._range.from, this._range.from + this._receivedLength - 1);
        }
    }

    _onTimeout(e) {
        this._status = LoaderStatus.kError;
        if (this._onError) {
            this._onError(LoaderError.kConnectingTimeout, {code: -1, msg: 'Connection timeout'});
        } else {
            throw 'MozChunkedLoader: Connection timeout';
        }
    }

    _onError(e) {
        this._status = LoaderStatus.kError;
        if (this._onError) {
            this._onError(LoaderError.kException, {code: e.target.status, msg: e.error});
        } else {
            throw e.error;
        }
    }

}

export default MozChunkedLoader;