import Log from '../utils/logger.js';
import {LoaderStatus, LoaderError} from './loader.js';
import SpeedCalculator from './speed-calculator.js';
import FetchStreamLoader from './fetch-stream-loader.js';
import MozChunkedLoader from './xhr-moz-chunked-loader.js';
import MSStreamLoader from './xhr-msstream-loader.js';
import RangeLoader from './xhr-range-loader.js';

// Manage IO Loaders
class IOController {

    constructor(url) {
        this.TAG = this.constructor.name;

        this._stashUsed = 0;
        this._stashInitialSize = 1024 * 384;  // initial size: 384KB
        this._stashSize = this._stashInitialSize;
        this._bufferSize = 1024 * 1024 * 3;  // initial size: 3MB
        this._stashBuffer = new ArrayBuffer(this._bufferSize);
        this._stashByteStart = 0;
        this._enableStash = false;

        this._loader = null;
        this._loaderClass = null;
        this._url = url;
        this._totalLength = null;
        this._fullRequestFlag = false;
        this._currentRange = null;
        this._progressRanges = [];
        this._speed = 0;
        this._speedCalc = new SpeedCalculator();
        this._speedNormalizeList = [64, 128, 256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096];

        this._paused = false;
        this._resumeFrom = 0;

        this._onDataArrival = null;
        this._onSeeked = null;
        this._onError = null;

        this._selectLoader();
        this._createLoader();
    }

    destroy() {
        if (this._loader.isWorking()) {
            this._loader.abort();
        }
        this._loader.destroy();
        this._loader = null;
        this._loaderClass = null;
        this._url = null;
        this._stashBuffer = null;
        this._stashUsed = this._stashSize = this._bufferSize = this._stashByteStart = 0;
        this._enableStash = false;
        this._currentRange = null;
        this._progressRanges = null;
        this._speedCalc = null;

        this._onDataArrival = null;
        this._onSeeked = null;
        this._onError = null;
    }

    isWorking() {
        return this._loader && this._loader.isWorking() && !this._paused;
    }

    isPaused() {
        return this._paused;
    }

    get status() {
        return this._loader.status;
    }

    // prototype: function onDataArrival(chunks: ArrayBuffer, byteStart: number): number
    get onDataArrival() {
        return this._onDataArrival;
    }

    set onDataArrival(callback) {
        if (typeof callback !== 'function') {
            throw 'onDataArrival must be a callback function!';
        }

        this._onDataArrival = callback;
    }

    // TODO: add SeekReason: Request / internal(continue loading, reconnecting)
    get onSeeked() {
        return this._onSeeked;
    }

    set onSeeked(callback) {
        if (typeof callback !== 'function')
            throw 'onSeeked must be a callback function!';
        this._onSeeked = callback;
    }

    // prototype: function onError(type: number, info: {code: number, msg: string}): void
    get onError() {
        return this._onError;
    }

    set onError(callback) {
        if (typeof callback !== 'function') {
            throw 'onError must be a callback function!';
        }

        this._onError = callback;
    }

    _selectLoader() {
        if (FetchStreamLoader.isSupported()) {
            this._loaderClass = FetchStreamLoader;
        } else if (MSStreamLoader.isSupported()) {
            this._loaderClass = MSStreamLoader;
        } else if (MozChunkedLoader.isSupported()) {
            this._loaderClass = MozChunkedLoader;
        } else if (RangeLoader.isSupported()) {
            Log.w(this.TAG, 'Your browser doesn\'t support streaming!');
            this._loaderClass = RangeLoader;
        } else {
            throw 'Your browser doesn\'t support xhr with arraybuffer responseType!';
        }
    }

    _createLoader() {
        this._loader = new this._loaderClass();
        this._enableStash = this._loader.needStashBuffer;
        this._loader.onContentLengthKnown = this._onContentLengthKnown.bind(this);
        this._loader.onDataArrival = this._onLoaderChunkArrival.bind(this);
        this._loader.onComplete = this._onLoaderComplete.bind(this);
        this._loader.onError = this._onLoaderError.bind(this);
        Log.v(this.TAG, 'Created loader: ' + this._loader.type);  // FIXME
    }

    open() {
        this._currentRange = {from: 0, to: -1};
        this._progressRanges = [];
        this._progressRanges.push(this._currentRange);
        this._speedCalc.reset();
        this._fullRequestFlag = true;
        this._loader.open(this._url, {from: 0, to: -1});
    }

    abort() {
        this._loader.abort();
        this._mergeRanges(this._currentRange.from, this._currentRange.to);

        if (this._paused) {
            this._paused = false;
            this._resumeFrom = 0;
        }
    }

    pause() {
        if (this.isWorking()) {
            this._loader.abort();
            this._mergeRanges(this._currentRange.from, this._currentRange.to);

            if (this._stashUsed !== 0) {
                this._resumeFrom = this._stashByteStart;
                this._currentRange.to = this._stashByteStart - 1;
            } else {
                this._resumeFrom = this._currentRange.to + 1;
            }
            this._stashUsed = 0;
            this._stashByteStart = 0;
            this._paused = true;
        }
    }

    resume() {
        if (this._paused) {
            this._paused = false;
            let bytes = this._resumeFrom;
            this._resumeFrom = 0;
            this._internalSeek(bytes, true, false);
        }
    }

    seek(bytes) {
        this._paused = false;
        this._currentRange = {from: 0, to: -1};
        this._progressRanges = [];
        this._stashUsed = 0;
        this._stashByteStart = 0;
        this._internalSeek(bytes, true, false);
    }

    getCurrentWorkingRange() {
        return Object.assign({}, this._currentRange);
    }

    searchRangeContains(bytes) {
        let ranges = this._progressRanges;

        for (let i = 0; i < ranges.length; i++) {
            let range = ranges[i];
            if (range.from <= bytes && bytes < range.to) {
                return range;
            }
        }
        return null;
    }

    continueLoadRange(range) {
        if (range != null) {
            if (this._totalLength === null ||
                    (this._totalLength !== null && range.to < this._totalLength - 1)) {
                this._internalSeek(range.to + 1, true, true);
            }
        }
    }

    /**
     * When seeking request is from media seeking, unconsumed stash data should be dropped
     * However, stash data shouldn't be dropped if seeking requested from http reconnection
     *
     * @dropUnconsumed: Ignore and discard all unconsumed data in stash buffer
     * @doFlushRanges: Flush/Remove all buffered ranges after seekpoint
     */
    _internalSeek(bytes, dropUnconsumed, doFlushRanges) {
        if (this._loader.isWorking()) {
            this._loader.abort();
        }

        if (doFlushRanges && bytes <= this._stashByteStart + this._stashUsed) {
            // current buffering position must be discard. Drop all stash data
            if (this._stashUsed !== 0) {
                this._currentRange.to = this._stashByteStart - 1;
            }
            this._stashUsed = 0;
            this._stashByteStart = 0;
        } else {
            // dispatch & flush stash buffer before seek
            let remain = this._flushStashBuffer(dropUnconsumed);
            if (remain) {
                this._currentRange.to -= remain;
            }
        }

        this._loader.destroy();
        this._loader = null;

        Log.v(this.TAG, 'Ranges before seek: ' + JSON.stringify(this._progressRanges));

        let ranges = this._progressRanges;
        let requestRange = {from: bytes, to: -1};
        let bufferedArea = false;
        let insertIndex = 0;

        if (doFlushRanges) {
            for (let i = 0; i < ranges.length; i++) {
                if (ranges[i].from >= bytes) {
                    ranges.splice(i, ranges.length - i);
                    break;
                } else if (ranges[i].to >= bytes) {
                    ranges[i].to = bytes - 1;
                    ranges.splice(i + 1, ranges.length - i - 1);
                    break;
                }
            }
        }

        this._mergeRanges(this._currentRange.from, this._currentRange.to);

        for (let i = 0; i < ranges.length; i++) {
            if (bytes >= ranges[i].from && bytes <= ranges[i].to) {
                bufferedArea = true;
                break;
            }

            if (i === ranges.length - 1) {
                insertIndex = ranges.length;
                break;
            }

            if (bytes > ranges[i].to && bytes < ranges[i + 1].from) {
                requestRange.to = ranges[i + 1].from - 1;
                insertIndex = i + 1;
                break;
            }
        }

        if (bufferedArea) {  // TODO: allow re-load buffered area
            Log.w(this.TAG, 'Seek target position has been buffered!');
        }

        this._currentRange = {from: requestRange.from, to: -1};
        ranges.splice(insertIndex, 0, this._currentRange);

        Log.v(this.TAG, 'Ranges after seek: ' + JSON.stringify(this._progressRanges));

        this._speed = 0;
        this._speedCalc.reset();
        this._stashSize = this._stashInitialSize;
        this._createLoader();
        this._loader.open(this._url, requestRange);

        if (this._onSeeked) {
            this._onSeeked();
        }
    }

    updateUrl(url) {
        if (!url || typeof url !== 'string' || url.length === 0) {
            throw 'Url must be a non-empty string!';
        }

        this._url = url;

        // TODO: reconnect with new url
    }

    _expandBuffer(expectedBytes) {
        let bufferNewSize = this._stashSize;
        while (bufferNewSize + 1024 * 1024 * 1 < expectedBytes) {
            bufferNewSize *= 2;
        }

        bufferNewSize += 1024 * 1024 * 1;  // bufferSize = stashSize + 1MB
        if (bufferNewSize === this._bufferSize) {
            return;
        }

        let newBuffer = new ArrayBuffer(bufferNewSize);

        if (this._stashUsed > 0) {  // copy existing data into new buffer
            let stashOldArray = new Uint8Array(this._stashBuffer, 0, this._stashUsed);
            let stashNewArray = new Uint8Array(newBuffer, 0, bufferNewSize);
            stashNewArray.set(stashOldArray, 0);
        }

        this._stashBuffer = newBuffer;
        this._bufferSize = bufferNewSize;
        Log.v(this.TAG, `expandBuffer: targetBufferSize = ${this._bufferSize}`);
    }

    _normalizeSpeed(input) {
        let list = this._speedNormalizeList;
        let last = list.length - 1;
        let mid = 0;
        let lbound = 0;
        let ubound = last;

        if (input < list[0]) {
            return list[0];
        }

        // binary search
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

    _adjustStashSize(normalized) {
        let stashSizeKB = 0;

        if (normalized < 512) {
            stashSizeKB = normalized;
        } else if (normalized >= 512 && normalized <= 1024) {
            stashSizeKB = Math.floor(normalized * 1.5);
        } else {
            stashSizeKB = normalized * 2;
        }

        if (stashSizeKB > 8192) {
            stashSizeKB = 8192;
        }

        let bufferSize = stashSizeKB * 1024 + 1024 * 1024 * 1;  // stashSize + 1MB
        if (this._bufferSize < bufferSize) {
            this._expandBuffer(bufferSize);
        }
        this._stashSize = stashSizeKB * 1024;
        Log.v(this.TAG, `adjustStashSize: enableStash = ${this._enableStash}, targetStashSize = ${stashSizeKB} KB`);
    }

    _dispatchChunks(chunks, byteStart) {
        Log.v(this.TAG, `_dispatchChunks: chunkSize = ${chunks.byteLength}, byteStart = ${byteStart}`);
        this._currentRange.to = byteStart + chunks.byteLength - 1;
        return this._onDataArrival(chunks, byteStart);
    }

    _onContentLengthKnown(contentLength) {
        if (contentLength && this._fullRequestFlag) {
            this._totalLength = contentLength;
            this._fullRequestFlag = false;
            Log.v(this.TAG, `Total-Length: ${contentLength}`);
        }
    }

    _onLoaderChunkArrival(chunk, byteStart, receivedLength) {
        if (!this._onDataArrival) {
            throw 'IOController: No existing consumer (onDataArrival) callback!';
        }
        if (this._paused) {
            return;
        }

        this._speedCalc.addBytes(chunk.byteLength);

        // adjust stash buffer size according to network speed dynamically
        let KBps = this._speedCalc.lastSecondKBps;
        if (KBps !== 0) {
            let normalized = this._normalizeSpeed(KBps);
            if (this._speed !== normalized) {
                this._speed = normalized;
                this._adjustStashSize(normalized);
            }
        }

        if (!this._enableStash) {  // disable stash
            if (this._stashUsed === 0) {
                // dispatch chunk directly to consumer;
                // check ret value (consumed bytes) and stash unconsumed to stashBuffer
                let consumed = this._dispatchChunks(chunk, byteStart);
                if (consumed < chunk.byteLength) {  // unconsumed data remain.
                    let remain = chunk.byteLength - consumed;
                    if (remain > this._bufferSize) {
                        this._expandBuffer(remain);
                    }
                    let stashArray = new Uint8Array(this._stashBuffer, 0, this._bufferSize);
                    stashArray.set(new Uint8Array(chunk, consumed), 0);
                    this._stashUsed += remain;
                    this._stashByteStart = byteStart + consumed;
                }
            } else {
                // else: Merge chunk into stashBuffer, and dispatch stashBuffer to consumer.
                if (this._stashUsed + chunk.byteLength > this._bufferSize) {
                    this._expandBuffer(this._stashUsed + chunk.byteLength);
                }
                let stashArray = new Uint8Array(this._stashBuffer, 0, this._bufferSize);
                stashArray.set(new Uint8Array(chunk), this._stashUsed);
                this._stashUsed += chunk.byteLength;
                let consumed = this._dispatchChunks(this._stashBuffer.slice(0, this._stashUsed), this._stashByteStart);
                if (consumed < this._stashUsed && consumed > 0) {  // unconsumed data remain
                    let remainArray = new Uint8Array(this._stashBuffer, consumed);
                    stashArray.set(remainArray, 0);
                }
                this._stashUsed -= consumed;
                this._stashByteStart += consumed;
            }
        } else {  // enable stash
            if (this._stashUsed === 0 && this._stashByteStart === 0) {  // seeked? or init chunk?
                // This is the first chunk after seek action
                this._stashByteStart = byteStart;
            }
            if (this._stashUsed + chunk.byteLength <= this._stashSize) {
                // just stash
                let stashArray = new Uint8Array(this._stashBuffer, 0, this._stashSize);
                stashArray.set(new Uint8Array(chunk), this._stashUsed);
                this._stashUsed += chunk.byteLength;
            } else {  // stashUsed + chunkSize > stashSize, size limit exceeded
                let stashArray = new Uint8Array(this._stashBuffer, 0, this._bufferSize);
                if (this._stashUsed > 0) {  // There're stash datas in buffer
                    // dispatch the whole stashBuffer, and stash remain data
                    // then append chunk to stashBuffer (stash)
                    let buffer = this._stashBuffer.slice(0, this._stashUsed);
                    let consumed = this._dispatchChunks(buffer, this._stashByteStart);
                    if (consumed < buffer.byteLength) {
                        if (consumed > 0) {
                            let remainArray = new Uint8Array(buffer, consumed);
                            stashArray.set(remainArray, 0);
                            this._stashUsed = remainArray.byteLength;
                            this._stashByteStart += consumed;
                        }
                    } else {
                        this._stashUsed = 0;
                        this._stashByteStart += consumed;
                    }
                    if (this._stashUsed + chunk.byteLength > this._bufferSize) {
                        this._expandBuffer(this._stashUsed + chunk.byteLength);
                        stashArray = new Uint8Array(this._stashBuffer, 0, this._bufferSize);
                    }
                    stashArray.set(new Uint8Array(chunk), this._stashUsed);
                    this._stashUsed += chunk.byteLength;
                } else {  // stash buffer empty, but chunkSize > stashSize (oh, holy shit)
                    // dispatch chunk directly and stash remain data
                    let consumed = this._dispatchChunks(chunk, byteStart);
                    if (consumed < chunk.byteLength) {
                        let remain = chunk.byteLength - consumed;
                        if (remain > this._bufferSize) {
                            this._expandBuffer(remain);
                            stashArray = new Uint8Array(this._stashBuffer, 0, this._bufferSize);
                        }
                        stashArray.set(new Uint8Array(chunk, consumed), 0);
                        this._stashUsed += remain;
                        this._stashByteStart = byteStart + consumed;
                    }
                }
            }
        }
    }

    _flushStashBuffer(dropUnconsumed) {
        if (this._stashUsed > 0) {
            let buffer = this._stashBuffer.slice(0, this._stashUsed);
            let consumed = this._dispatchChunks(buffer, this._stashByteStart);
            let remain = buffer.byteLength - consumed;

            if (consumed < buffer.byteLength) {
                if (dropUnconsumed) {
                    Log.w(this.TAG, `${remain} bytes unconsumed data remain when flush buffer, dropped`);
                } else {
                    if (consumed > 0) {
                        let stashArray = new Uint8Array(this._stashBuffer, 0, this._bufferSize);
                        let remainArray = new Uint8Array(buffer, consumed);
                        stashArray.set(remainArray, 0);
                        this._stashUsed = remainArray.byteLength;
                        this._stashByteStart += consumed;
                    }
                    return 0;
                }
            }
            this._stashUsed = 0;
            this._stashByteStart = 0;
            return remain;
        }
        return 0;
    }

    /**
     * @return next load range
     */
    _mergeRanges(from, to) {
        let ranges = this._progressRanges;
        let length = ranges.length;
        let next = {from: -1, to: -1};

        let backup = Object.assign({}, this._currentRange);

        // left endpoint merge
        for (let i = 0; i < length; i++) {
            if (ranges[i].from === from && ranges[i].to <= to) {
                ranges[i].to = to;
                if (i > 0 && ranges[i - 1].to + 1 === ranges[i].from) {
                    from = ranges[i - 1].from;
                    ranges[i - 1].to = ranges[i].to;
                    ranges.splice(i, 1);
                    length--;
                }
                break;
            }
        }

        // right endpoint merge
        for (let i = 0; i < length; i++) {
            if (ranges[i].from === from && ranges[i].to === to) {
                if (i === length - 1) {  // latest range
                    // +1s
                    if (this._totalLength && ranges[i].to + 1 < this._totalLength) {
                        next.from = ranges[i].to + 1;
                        next.to = -1;
                    }
                } else if (to + 1 === ranges[i + 1].from) {
                    // Merge connected ranges
                    ranges[i].to = ranges[i + 1].to;
                    ranges.splice(i + 1, 1);
                    length--;
                    if (i === length - 1) {  // latest range
                        if (this._totalLength && ranges[i].to + 1 < this._totalLength) {
                            next.from = ranges[i].to + 1;
                            next.to = -1;
                        }
                    } else {
                        if (ranges[i].to < ranges[i + 1].from - 1) {
                            next.from = ranges[i].to + 1;
                            next.to = ranges[i + 1].from - 1;
                        }
                    }
                }
                break;
            }
        }

        // correct this._currentRange
        let corrected = false;
        length = this._progressRanges.length;
        for (let i = 0; i < length; i++) {
            let range = this._progressRanges[i];
            if (range.from <= backup.from && backup.to <= range.to
                                          && !(range.from === backup.from && range.to === backup.to)) {
                corrected = true;
                this._currentRange = range;
                break;
            }
        }

        if (!corrected) {
            this._currentRange = backup;
        }

        return next;
    }

    _onLoaderComplete(from, to) {
        // Force-flush stash buffer, and drop unconsumed data
        this._flushStashBuffer(true);

        Log.v(this.TAG, `Loader complete, from = ${from}, to = ${to}`);
        Log.v(this.TAG, JSON.stringify(this._progressRanges));

        let next = this._mergeRanges(from, to);

        Log.v(this.TAG, 'Adjusted ranges: ' + JSON.stringify(this._progressRanges));

        // continue loading from appropriate position
        if (next.from !== -1) {
            this._internalSeek(next.from, true, false);
        }
    }

    _onLoaderError(type, data) {
        Log.e(this.TAG, `Loader error, code = ${data.code}, msg = ${data.msg}`);

        this._flushStashBuffer(false);

        switch (type) {
            case LoaderError.kEarlyEof: {
                // http reconnect
                Log.w(this.TAG, 'Connection lost, trying reconnect...');
                let current = this._currentRange;
                let next = this._mergeRanges(current.from, current.to);
                if (next.from !== -1) {
                    this._internalSeek(next.from, false, false);
                }
                return;
            }
            case LoaderError.kConnectingTimeout:
            case LoaderError.kHttpStatusCodeInvalid:
            case LoaderError.kException:
                break;
        }

        if (this._onError) {
            this._onError(type, data);
        } else {
            throw 'IOException: ' + data.msg;
        }
    }

}

export default IOController;