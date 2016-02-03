import EventEmitter from 'events';
import MSEController from './core/mse-controller.js';
import IOController from './io/io-controller.js';
import Remuxer from './core/remuxer.js';

class Flv {

    static isSupported() {
        return (window.MediaSource && window.MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"'));
    }

    constructor(url) {
        this._mseController = new MSEController();
        this._ioController = new IOController(url);
        this._remuxer = new Remuxer(true);
    }

    addEventListener(type, listener) {

    }

    removeEventListener(type, listener) {

    }

    attachMediaElement() {

    }

    detachMediaElement() {

    }

    setMediaUrl(url) {
        if (typeof url !== 'string') {
            throw 'setMediaUrl requires a string!';
        }

        this._url = url;
    }

    setMediaSegmentUrls(urls) {
        if (!Array.isArray(urls)) {
            throw 'setMediaSegmentUrls requires a string array!';
        }

        // TODO
    }

    getMediaInfo() {

    }

    start() {

    }

    pause() {

    }

    stop() {

    }

    seekTo() {

    }

    openStream() {
        this._ioController.openStream();
        this._remuxer.seek(12450, 45120);
    }

}

window.Flv = Flv;
export default Flv;