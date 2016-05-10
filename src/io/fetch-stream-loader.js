import Log from '../utils/logger.js';
import {BaseLoader, LoaderStatus, LoaderError} from './loader.js';

class FetchStreamLoader extends BaseLoader {

    static isSupported() {
        try {
            return (self.fetch && self.ReadableByteStream);
        } catch (e) {
            return false;
        }
    }

    constructor() {
        super('fetch-stream');
        this.TAG = this.constructor.name;
        this._needStash = true;

        this._requestAbort = false;
        this._contentLength = null;
        this._receivedLength = 0;
    }

    destroy() {
        if (this.isWorking()) {
            this.abort();
        }
        super.destroy();
    }

    open(dataSource, range) {
        this._dataSource = dataSource;
        this._range = range;

        let headers = new self.Headers();

        if (range.from !== 0 || range.to !== -1) {
            let param;
            if (range.to !== -1) {
                param = 'bytes=' + range.from.toString() + '-' + range.to.toString();
            } else {
                param = 'bytes=' + range.from.toString() + '-';
            }
            headers.append('Range', param);
        }

        let params = {
            method: 'GET',
            headers: headers,
            mode: 'cors',
            cache: 'default'
        };

        // cors is enabled by default
        if (dataSource.cors === false) {
            // no-cors means 'disregard cors policy', which can only be used in ServiceWorker
            params.mode = 'same-origin';
        }

        // withCredentials is disabled by default
        if (dataSource.withCredentials) {
            params.credentials = 'include';
        }

        this._status = LoaderStatus.kConnecting;
        self.fetch(dataSource.url, params).then((res) => {
            if (this._requestAbort) {
                this._requestAbort = false;
                this._status = LoaderStatus.kIdle;
                return;
            }
            if (res.ok && (res.status >= 200 && res.status <= 299)) {
                let lengthHeader = res.headers.get('Content-Length');
                if (lengthHeader != null) {
                    this._contentLength = parseInt(lengthHeader);
                    if (this._contentLength !== 0) {
                        if (this._onContentLengthKnown) {
                            this._onContentLengthKnown(this._contentLength);
                        }
                    }
                }
                return this._pump.call(this, res.body.getReader());
            } else {
                this._status = LoaderStatus.kError;
                if (this._onError) {
                    this._onError(LoaderError.kHttpStatusCodeInvalid, {code: res.status, msg: res.statusText});
                } else {
                    throw 'FetchStreamLoader: Http code invalid, ' + res.status + ' ' + res.statusText;
                }
            }
        }).catch((e) => {
            this._status = LoaderStatus.kError;
            if (this._onError) {
                this._onError(LoaderError.kException, {code: -1, msg: e.message});
            } else {
                throw e;
            }
        });
    }

    abort() {
        this._requestAbort = true;
    }

    _pump(reader) {  // ReadableStreamReader
        return reader.read().then((result) => {
            if (result.done) {
                this._status = LoaderStatus.kComplete;
                if (this._onComplete) {
                    this._onComplete(this._range.from, this._range.from + this._receivedLength - 1);
                }
            } else {
                if (this._requestAbort === true) {
                    this._requestAbort = false;
                    this._status = LoaderStatus.kComplete;
                    return reader.cancel();
                }

                this._status = LoaderStatus.kBuffering;

                let chunk = result.value.buffer;
                let byteStart = this._range.from + this._receivedLength;
                this._receivedLength += chunk.byteLength;

                if (this._onDataArrival) {
                    this._onDataArrival(chunk, byteStart, this._receivedLength);
                }

                return this._pump(reader);
            }
        }).catch((e) => {
            this._status = LoaderStatus.kError;
            let type = 0;
            let info = null;

            if (e.code === 19 && // NETWORK_ERR
                (this._contentLength === null ||
                (this._contentLength !== null && this._receivedLength < this._contentLength))) {
                type = LoaderError.kEarlyEof;
                info = {code: e.code, msg: 'Fetch stream meet Early-EOF'};
            } else {
                type = LoaderError.kException;
                info = {code: e.code, msg: e.message};
            }

            if (this._onError) {
                this._onError(type, info);
            } else {
                throw info.msg;
            }
        });
    }

}

export default FetchStreamLoader;