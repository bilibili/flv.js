import {LoaderStatus} from './loader.js';
import FetchStreamLoader from './fetch-stream-loader.js';
import MozChunkedLoader from './xhr-moz-chunked-loader.js';

// Manage IO Loaders
class IOController {

    // TODO: events. callbacks or EventEmitter?

    constructor(url) {
        // TODO: determine stash buffer size according to network speed dynamically
        this._stashBuffer = new ArrayBuffer(1024 * 1024 * 2);  // initial size: 2MB
        this._stashUsed = 0;
        this._stashSize = 1024 * 1024 * 2;
        this._stashByteStart = 0;
        this._enableStash = false;
        this._loader = null;
        this._loaderClass = null;
        this._url = url;
        this._currentSegment = null;
        this._progressSegments = [];

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
        this._stashBuffer = null;
        this._stashUsed = this._stashSize = this._stashByteStart = 0;
        this._enableStash = false;
        this._currentSegment = null;
        this._progressSegments = null;

        this._onDataArrival = null;
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
        this._loader.onDataArrival = this._onLoaderChunkArrival.bind(this);
        this._loader.onComplete = this._onLoaderComplete.bind(this);
        this._loader.onError = this._onLoaderError.bind(this);
        console.log('Created loader: ' + this._loader.type);  // FIXME
    }

    open() {
        this._currentSegment = {from: 0, to: -1};
        this._progressSegments = [];
        this._progressSegments.push(this._currentSegment);
        this._loader.open(this._url, {from: 0, to: -1});
    }

    abort() {
        this._loader.abort();
    }

    seek(bytes) {
        if (this._loader.isWorking()) {
            this._loader.abort();
        }
        this._stashUsed = 0;
        this._stashByteStart = 0;

        this._loader.destroy();
        this._loader = null;

        console.log('segments before seek: ' + JSON.stringify(this._progressSegments));

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

        this._currentSegment = {from: range.from, to: range.to};
        segments.splice(insertIndex, 0, this._currentSegment);

        console.log('segments after seek: ' + JSON.stringify(this._progressSegments));

        this._createLoader();
        this._loader.open(this._url, range);
    }

    _expandBuffer(expectedBytes) {
        let stashNewSize = this._stashSize;
        while (stashNewSize < expectedBytes) {
            stashNewSize *= 2;
        }

        if (stashNewSize === this._stashSize) {
            return;
        }

        let stashNewBuffer = new ArrayBuffer(stashNewSize);

        if (this._stashUsed > 0) {  // copy existing data into new buffer
            let stashOldArray = new Uint8Array(this._stashBuffer, 0, this._stashUsed);
            let stashNewArray = new Uint8Array(stashNewBuffer, 0, stashNewSize);
            stashNewArray.set(stashOldArray, 0);
        }

        this._stashBuffer = stashNewBuffer;
        this._stashSize = stashNewSize;
        console.log('expandBuffer: targetSize = ' + this._stashSize);
    }

    _dispatchChunks(chunks, byteStart) {
        console.log('_dispatchChunks: chunkSize = ' + chunks.byteLength + ', byteStart = ' + byteStart);
        this._currentSegment.to = byteStart + chunks.byteLength - 1;
        return this._onDataArrival(chunks, byteStart);
    }

    _onLoaderChunkArrival(chunk, byteStart, receivedLength) {
        if (!this._onDataArrival) {
            throw 'IOController: No existing consumer (onDataArrival) callback!';
        }

        if (!this._enableStash) {
            if (this._stashUsed === 0) {
                // dispatch chunk directly to consumer;
                // check ret value (consumed bytes) and stash unconsumed to stashBuffer
                let consumed = this._dispatchChunks(chunk, byteStart);
                if (consumed < chunk.byteLength) {  // unconsumed data remain.
                    let remain = chunk.byteLength - consumed;
                    if (remain > this._stashSize) {
                        this._expandBuffer(remain);
                    }
                    let stashArray = new Uint8Array(this._stashBuffer, 0, this._stashSize);
                    stashArray.set(new Uint8Array(chunk, consumed), 0);
                    this._stashUsed += remain;
                    this._stashByteStart = byteStart + consumed;
                }
            } else {
                // else: Merge chunk into stashBuffer, and dispatch stashBuffer to consumer.
                if (this._stashUsed + chunk.byteLength > this._stashSize) {
                    this._expandBuffer(this._stashUsed + chunk.byteLength);
                }
                let stashArray = new Uint8Array(this._stashBuffer, 0, this._stashSize);
                stashArray.set(chunk, this._stashUsed);
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
            let stashArray = new Uint8Array(this._stashBuffer, 0, this._stashSize);
            if (this._stashUsed + chunk.byteLength <= this._stashSize) {
                stashArray.set(chunk, this._stashUsed);
                this._stashUsed += chunk.byteLength;
            } else {  // stashUsed + chunkSize > stashSize
                if (this._stashUsed > 0) {
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
                    if (this._stashUsed + chunk.byteLength > this._stashSize) {
                        this._expandBuffer(this._stashUsed + chunk.byteLength);
                        stashArray = new Uint8Array(this._stashBuffer, 0, this._stashSize);
                    }
                    stashArray.set(chunk, this._stashUsed);
                    this._stashUsed += chunk.byteLength;
                } else {  // stash buffer empty, but chunkSize > stashSize (oh, holy shit)
                    // dispatch directly and stash remain data
                    let consumed = this._dispatchChunks(chunk, byteStart);
                    if (consumed < chunk.byteLength) {
                        let remain = chunk.byteLength - consumed;
                        if (remain > this._stashSize) {
                            this._expandBuffer(remain);
                            stashArray = new Uint8Array(this._stashBuffer, 0, this._stashSize);
                        }
                        stashArray.set(new Uint8Array(chunk, consumed), 0);
                        this._stashUsed += remain;
                        this._stashByteStart = byteStart + consumed;
                    }
                }
            }
        }

        // TODO: network average speed statistics, stash buffer size adjustments
    }

    _onLoaderComplete(from, to) {
        console.log('IOController: loader complete, from = ' + from + ', to = ' + to);
        console.log(JSON.stringify(this._progressSegments));

        let segments = this._progressSegments;
        for (let i = 0; i < segments.length; i++) {
            if (segments[i].from === from && segments[i].to <= to) {
                segments[i].to = to;
                if (i === segments.length - 1) {
                    break;
                } else if (segments[i + 1].from === to + 1) {
                    // Merge connected segments
                    segments[i].to = segments[i + 1].to;
                    segments.splice(i + 1, 1);
                }
                break;
            }
        }
        console.log('Adjusted segments: ' + JSON.stringify(this._progressSegments));

        // Force-flush stash buffer
        if (this._stashUsed > 0) {
            let buffer = this._stashBuffer.slice(0, this._stashUsed);
            let consumed = this._dispatchChunks(buffer, this._stashByteStart);
            if (consumed < buffer.byteLength) {
                let remain = buffer.byteLength - consumed;
                console.warn('IOController: ' + remain + ' bytes unconsumed data remain when loader completed');
            }
            this._stashUsed = 0;
            this._stashByteStart += buffer.byteLength;
        }

        // TODO: +1s
    }

    _onLoaderError(type, data) {
        // TODO: http reconnect or throw out error.
        // Allow user to re-assign segment url for retrying (callback -> Flv)
        console.log('IOController: loader error, code = ' + data.code + ', msg = ' + data.msg);
    }

}

export default IOController;