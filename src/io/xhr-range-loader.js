import Log from '../utils/logger.js';
import SpeedSampler from './speed-sampler.js';
import {BaseLoader, LoaderStatus, LoaderError} from './loader.js';
import {RuntimeException} from '../utils/exception.js';

// Universal IO Loader, implemented by adding Range header in xhr's request header
class RangeLoader extends BaseLoader {

    static isSupported() {
        try {
            let xhr = new XMLHttpRequest();
            xhr.open('GET', 'https://example.com', true);
            xhr.responseType = 'arraybuffer';
            return (xhr.responseType === 'arraybuffer');
        } catch (e) {
            Log.w('RangeLoader', e.message);
            return false;
        }
    }

    constructor() {
        super('xhr-range-loader');
        this.TAG = this.constructor.name;
        this._needStash = false;

        this._chunkSizeKBList = [128, 256, 512, 768, 1024, 1536, 2048, 3072, 4096];
        this._currentChunkSizeKB = 256;
        this._currentSpeed = 0;
        this._currentSpeedNormalized = 0;

        this._xhr = null;
        this._speedSampler = new SpeedSampler();

        this._requestAbort = false;
        this._waitForTotalLength = false;
        this._totalLengthReceived = false;

        this._currentRequestRange = null;
        this._totalLength = null;  // size of the entire file
        this._contentLength = null;  // Content-Length of entire request range
        this._receivedLength = 0;  // total received bytes
        this._lastTimeLoaded = 0;  // received bytes of current request sub-range
    }

    destroy() {
        if (this.isWorking()) {
            this.abort();
        }
        if (this._xhr) {
            this._xhr.onreadystatechange = null;
            this._xhr.onprogress = null;
            this._xhr.onload = null;
            this._xhr.onerror = null;
            this._xhr = null;
        }
        super.destroy();
    }

    get currentSpeed() {
        return this._currentSpeed;
    }

    open(dataSource, range) {
        this._dataSource = dataSource;
        this._range = range;
        this._status = LoaderStatus.kConnecting;

        if (!this._totalLengthReceived) {
            // We need total filesize
            this._waitForTotalLength = true;
            this._internalOpen(this._dataSource, {from: 0, to: -1});
        } else {
            // We have filesize, start loading
            this._openSubRange();
        }
    }

    _openSubRange() {
        let chunkSize = this._currentChunkSizeKB * 1024;

        let from = this._range.from + this._receivedLength;
        let to = from + chunkSize;
        if (this._contentLength != null) {
            if (to - this._range.from >= this._contentLength) {
                to = this._range.from + this._contentLength - 1;
            }
        }

        this._currentRequestRange = {from, to};
        this._internalOpen(this._dataSource, this._currentRequestRange);
    }

    _internalOpen(dataSource, range) {
        this._lastTimeLoaded = 0;

        let xhr = this._xhr = new XMLHttpRequest();

        xhr.open('GET', dataSource.url, true);
        xhr.responseType = 'arraybuffer';
        xhr.onreadystatechange = this._onReadyStateChange.bind(this);
        xhr.onprogress = this._onProgress.bind(this);
        xhr.onload = this._onLoad.bind(this);
        xhr.onerror = this._onXhrError.bind(this);

        if (dataSource.withCredentials && xhr['withCredentials']) {
            xhr.withCredentials = true;
        }

        if (range.from !== 0 || range.to !== -1) {
            let param;
            if (range.to !== -1) {
                param = `bytes=${range.from.toString()}-${range.to.toString()}`;
            } else {
                param = `bytes=${range.from.toString()}-`;
            }
            xhr.setRequestHeader('Range', param);
        }

        xhr.send();
    }

    abort() {
        this._requestAbort = true;
        this._internalAbort();
        this._status = LoaderStatus.kComplete;
    }

    _internalAbort() {
        if (this._xhr) {
            this._xhr.onreadystatechange = null;
            this._xhr.onprogress = null;
            this._xhr.onload = null;
            this._xhr.onerror = null;
            this._xhr.abort();
            this._xhr = null;
        }
    }

    _onReadyStateChange(e) {
        let xhr = e.target;

        if (xhr.readyState === 2) {  // HEADERS_RECEIVED
            if ((xhr.status >= 200 && xhr.status < 300)) {
                if (this._waitForTotalLength) {
                    return;
                }
                this._status = LoaderStatus.kBuffering;
            } else {
                this._status = LoaderStatus.kError;
                if (this._onError) {
                    this._onError(LoaderError.kHttpStatusCodeInvalid, {code: xhr.status, msg: xhr.statusText});
                } else {
                    throw new RuntimeException('RangeLoader: Http code invalid, ' + xhr.status + ' ' + xhr.statusText);
                }
            }
        }
    }

    _onProgress(e) {
        if (this._contentLength === null) {
            if (this._waitForTotalLength) {
                this._waitForTotalLength = false;
                this._totalLengthReceived = true;
                let total = e.total;
                this._internalAbort();
                if (total != null & total !== 0) {
                    this._totalLength = total;
                }
                this._openSubRange();
                return;
            }
            if (this._range.to === -1) {
                this._contentLength = this._totalLength - this._range.from;
            } else {  // to !== -1
                this._contentLength = this._range.to - this._range.from;
            }
            if (this._onContentLengthKnown) {
                this._onContentLengthKnown(this._contentLength);
            }
        }

        let delta = e.loaded - this._lastTimeLoaded;
        this._lastTimeLoaded = e.loaded;
        this._speedSampler.addBytes(delta);
    }

    _normalizeSpeed(input) {
        let list = this._chunkSizeKBList;
        let last = list.length - 1;
        let mid = 0;
        let lbound = 0;
        let ubound = last;

        if (input < list[0]) {
            return list[0];
        }

        while (lbound <= ubound) {
            mid = lbound + Math.floor((ubound - lbound) / 2);
            if (mid === last || (input >= list[mid] && input < list[mid + 1])) {
                return list[mid];
            } else if (list[mid] < input) {
                lbound = mid + 1;
            } else {
                ubound = mid - 1;
            }
        }
    }

    _onLoad(e) {
        if (this._waitForTotalLength) {
            this._waitForTotalLength = false;
            return;
        }

        this._lastTimeLoaded = 0;
        let KBps = this._speedSampler.lastSecondKBps;
        if (KBps !== 0) {
            this._currentSpeed = KBps;
            let normalized = this._normalizeSpeed(KBps);
            if (this._currentSpeedNormalized !== normalized) {
                this._currentSpeedNormalized = normalized;
                this._currentChunkSizeKB = normalized;
            }
        }

        let chunk = e.target.response;
        let byteStart = this._range.from + this._receivedLength;
        this._receivedLength += chunk.byteLength;

        let reportComplete = false;

        if (this._contentLength != null && this._receivedLength < this._contentLength) {
            // continue load next chunk
            this._openSubRange();
        } else {
            reportComplete = true;
        }

        // dispatch received chunk
        if (this._onDataArrival) {
            this._onDataArrival(chunk, byteStart, this._receivedLength);
        }

        if (reportComplete) {
            this._status = LoaderStatus.kComplete;
            if (this._onComplete) {
                this._onComplete(this._range.from, this._range.from + this._receivedLength - 1);
            }
        }
    }

    _onXhrError(e) {
        this._status = LoaderStatus.kError;
        let type = 0;
        let info = null;

        if (this._contentLength && this._receivedLength > 0
                                && this._receivedLength < this._contentLength) {
            type = LoaderError.kEarlyEof;
            info = {code: -1, msg: 'RangeLoader meet Early-Eof'};
        } else {
            type = LoaderError.kException;
            info = {code: -1, msg: e.constructor.name + ' ' + e.type};
        }

        if (this._onError) {
            this._onError(type, info);
        } else {
            throw new RuntimeException(info.msg);
        }
    }

}

export default RangeLoader;