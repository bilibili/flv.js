import FetchStreamLoader from './fetch-stream-loader.js';


class IOController {

    constructor(url) {
        // TODO: determine stash buffer size according to network speed dynamically
        this._chunkStash = new ArrayBuffer(1024 * 1024 * 2);  // 2MB
        this._enableStash = false;
        this._hasTempBuffer = false;
        this._loader = null;

        if (FetchStreamLoader.isSupported()) {
            this._loader = new FetchStreamLoader(this, url);
            this._loader.onDataArrival = this._onLoaderChunkArrival.bind(this);
        } else {
            throw 'Your browser doesn\'t support fetch api!';
        }
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

    hasTempBuffer() {
        return this._hasTempBuffer;
    }

    openStream() {
        this._loader.open();
    }

    abortStream() {
        this._loader.requestAbort();
    }

    seek(bytes) {
        // TODO: seek
        // flush stash buffer
        // set flag to drop later received chunks
        // Re-create loader instance with range param
        // clear flag
    }

    get status() {
        return this._loader._status;
    }

    _onLoaderChunkArrival(chunk, byteStart, receivedLength) {
        // TODO: check/stash/ret_check
        if (this._onDataArrival) {
            this._onDataArrival(chunk, byteStart, receivedLength);
        }
    }

}

export default IOController;