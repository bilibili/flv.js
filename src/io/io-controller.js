import Log from '../utils/logger.js';
import {LoaderStatus, LoaderError} from './loader.js';
import SpeedCalculator from './speed-calculator.js';
import FetchStreamLoader from './fetch-stream-loader.js';
import MozChunkedLoader from './xhr-moz-chunked-loader.js';

// Manage IO Loaders
class IOController {

    // TODO: events. callbacks or EventEmitter?

    constructor(url) {
        this.TAG = this.constructor.name;

        this._stashUsed = 0;
        this._stashSize = 1024 * 256;  // initial size: 256KB
        this._bufferSize = 1024 * 1024 * 3;  // initial size: 3MB
        this._stashBuffer = new ArrayBuffer(this._bufferSize);
        this._stashByteStart = 0;
        this._enableStash = false;

        this._loader = null;
        this._loaderClass = null;
        this._url = url;
        this._totalLength = null;
        this._fullRequestFlag = false;
        this._currentSegment = null;
        this._progressSegments = [];
        this._speed = 0;
        this._speedCalc = new SpeedCalculator();
        this._speedNormalizeList = [64, 128, 256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096];

        this._onDataArrival = null;
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
        this._currentSegment = null;
        this._progressSegments = null;
        this._speedCalc = null;

        this._onDataArrival = null;
        this._onError = null;
    }

    isWorking() {
        return this._loader && this._loader.isWorking();
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

    get stashBufferEnabled() {
        return this._enableStash;
    }

    set stashBufferEnabled(enable) {
        this._enableStash = enable;
    }

    _selectLoader() {
        if (FetchStreamLoader.isSupported()) {
            this._loaderClass = FetchStreamLoader;
        } else if (MozChunkedLoader.isSupported()) {
            this._loaderClass = MozChunkedLoader;
        } else {
            throw 'Your browser doesn\'t support streaming!';
        }
    }

    _createLoader() {
        this._loader = new this._loaderClass();
        this._loader.onContentLengthKnown = this._onContentLengthKnown.bind(this);
        this._loader.onDataArrival = this._onLoaderChunkArrival.bind(this);
        this._loader.onComplete = this._onLoaderComplete.bind(this);
        this._loader.onError = this._onLoaderError.bind(this);
        Log.v(this.TAG, 'Created loader: ' + this._loader.type);  // FIXME
    }

    open() {
        this._currentSegment = {from: 0, to: -1};
        this._progressSegments = [];
        this._progressSegments.push(this._currentSegment);
        this._speedCalc.reset();
        this._fullRequestFlag = true;
        this._loader.open(this._url, {from: 0, to: -1});
    }

    abort() {
        this._loader.abort();
    }

    seek(bytes) {
        this._internalSeek(bytes, true);
    }

    // When seeking request is from media seeking, unconsumed stash data should be dropped
    // However, stash data shouldn't be dropped if seeking requested from http reconnection
    _internalSeek(bytes, dropUnconsumed) {
        if (this._loader.isWorking()) {
            this._loader.abort();
        }
        let remain = this._flushStashBuffer(dropUnconsumed);
        if (remain) {
            this._currentSegment.to -= remain;
        }

        this._loader.destroy();
        this._loader = null;

        Log.v(this.TAG, 'segments before seek: ' + JSON.stringify(this._progressSegments));

        let segments = this._progressSegments;
        let range = {from: bytes, to: -1};
        let bufferedArea = false;
        let insertIndex = 0;

        for (let i = 0; i < segments.length; i++) {
            if (bytes >= segments[i].from && bytes <= segments[i].to) {
                bufferedArea = true;
                break;
            }

            if (i === segments.length - 1) {
                insertIndex = segments.length;
                break;
            }

            if (bytes > segments[i].to && bytes < segments[i + 1].from) {
                range.to = segments[i + 1].from - 1;
                insertIndex = i + 1;
                break;
            }
        }

        if (bufferedArea) {
            throw 'IOController: Seek target position has been buffered!';
        }

        this._currentSegment = {from: range.from, to: -1};
        segments.splice(insertIndex, 0, this._currentSegment);

        Log.v(this.TAG, 'segments after seek: ' + JSON.stringify(this._progressSegments));

        this._createLoader();
        this._loader.open(this._url, range);
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
        Log.v(this.TAG, `adjustStashSize: targetStashSize = ${stashSizeKB} KB`);
    }

    _dispatchChunks(chunks, byteStart) {
        Log.v(this.TAG, `_dispatchChunks: chunkSize = ${chunks.byteLength}, byteStart = ${byteStart}`);
        this._currentSegment.to = byteStart + chunks.byteLength - 1;
        return this._onDataArrival(chunks, byteStart);
    }

    _onContentLengthKnown(contentLength) {
        if (contentLength && this._fullRequestFlag) {
            this._totalLength = contentLength;
            this._fullRequestFlag = false;
            Log.v(this.TAG, `Content-Length: ${contentLength}`);
        }
    }

    _onLoaderChunkArrival(chunk, byteStart, receivedLength) {
        if (!this._onDataArrival) {
            throw 'IOController: No existing consumer (onDataArrival) callback!';
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

        // TODO: Too many newed Uint8Arrays... may cause gc pressure?

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
            } else {  // stashUsed + chunkSize > stashSize, size limit excceed
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

    _mergeSegmentsAndGetNext(from, to) {
        let segments = this._progressSegments;
        let length = segments.length;
        let next = {from: -1, to: -1};

        // left endpoint merge
        for (let i = 0; i < length; i++) {
            if (segments[i].from === from && segments[i].to <= to) {
                segments[i].to = to;
                if (i > 0 && segments[i - 1].to + 1 === segments[i].from) {
                    from = segments[i - 1].from;
                    segments[i - 1].to = segments[i].to;
                    segments.splice(i, 1);
                    length--;
                }
                break;
            }
        }

        // right endpoint merge
        for (let i = 0; i < length; i++) {
            if (segments[i].from === from && segments[i].to === to) {
                if (i === length - 1) {  // latest segment
                    // +1s
                    if (this._totalLength && segments[i].to + 1 < this._totalLength) {
                        next.from = segments[i].to + 1;
                        next.to = -1;
                    }
                } else if (to + 1 === segments[i + 1].from) {
                    // Merge connected segments
                    segments[i].to = segments[i + 1].to;
                    segments.splice(i + 1, i);
                    length--;
                    if (i === length - 1) {  // latest segment
                        if (this._totalLength && segments[i].to + 1 < this._totalLength) {
                            next.from = segments[i].to + 1;
                            next.to = -1;
                        }
                    } else {
                        if (segments[i].to < segments[i + 1].from - 1) {
                            next.from = segments[i].to + 1;
                            next.to = segments[i + 1].from - 1;
                        }
                    }
                }
                break;
            }
        }

        return next;
    }

    _onLoaderComplete(from, to) {
        // Force-flush stash buffer, and drop unconsumed data
        this._flushStashBuffer(true);

        Log.v(this.TAG, `Loader complete, from = ${from}, to = ${to}`);
        Log.v(this.TAG, JSON.stringify(this._progressSegments));

        let next = this._mergeSegmentsAndGetNext(from, to);

        Log.v(this.TAG, 'Adjusted segments: ' + JSON.stringify(this._progressSegments));

        // continue loading from appropriate position
        if (next.from !== -1) {
            this._internalSeek(next.from, true);
        }
    }

    _onLoaderError(type, data) {
        Log.e(this.TAG, `Loader error, code = ${data.code}, msg = ${data.msg}`);

        this._flushStashBuffer(false);

        switch (type) {
            case LoaderError.kEarlyEof:
                // http reconnect
                Log.w(this.TAG, 'Connection lost, trying reconnect...');
                let current = this._currentSegment;
                let next = this._mergeSegmentsAndGetNext(current.from, current.to);
                if (next.from !== -1) {
                    this._internalSeek(next.from, false);
                }
                return;
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