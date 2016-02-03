import {assert} from 'assert';
import {LoaderStatus} from './loader.js';

class FetchStreamLoader {

    static isSupported() {
        return (window.fetch && window.ReadableByteStream);
    }

    constructor(iocontroller, url) {
        this._iocontroller = iocontroller;
        this._url = url;
        this._status = LoaderStatus.kIdle;
        this._requestAbort = false;
        this._receivedLength = 0;
        this._onDataArrival = null;
    }

    destroy() {

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

    open() {
        let headers = new window.Headers();
        let params = {
            method: 'GET',
            headers: headers,
            mode: 'cors',
            cache: 'default'
        };

        let _this = this;

        window.fetch(this._url, params).then(function (res) {
            if (res.ok && (res.status === 200 || res.status === 206)) {
                console.log('Content-Length: ' + res.headers.get('Content-Length'));
                return _this._pump.bind(_this, res.body.getReader()).call();
            } else {
                // TODO: trigger IO error event
                throw 'Network error, ' + res.statusText;
            }
        }).catch(function (e) {
            console.log('caught exception in fetch, ' + e.message);
        });
    }

    requestAbort() {
        this._requestAbort = true;
    }

    _pump(reader) {  // ReadableStreamReader
        return reader.read().then(function (result) {
            if (result.done) {
                console.log('fetch: done');
                this._status = LoaderStatus.kEof;
                // TODO: trigger complete event
            } else {
                let chunk = result.value;
                let byteStart = this._receivedLength;
                this._receivedLength += chunk.byteLength;
                console.log('fetch: received chunk, size = ' + chunk.byteLength + ', total_received = ' + this._receivedLength);

                if (this._onDataArrival) {
                    this._onDataArrival(chunk, byteStart, this._receivedLength);
                }

                if (this._requestAbort) {
                    this._requestAbort = false;
                    return reader.cancel();
                } else {
                    return this._pump(reader);
                }
            }
        }.bind(this));
    }

}

export default FetchStreamLoader;