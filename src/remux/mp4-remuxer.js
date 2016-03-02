import Log from '../utils/logger.js';

class MP4Remuxer {

    constructor() {
        this.TAG = this.constructor.name;

        this._onFragGenerated = null;
    }

    destroy() {

    }

    bindDataSource(producer) {
        producer.onDataAvailable = this.remux.bind(this);
        return this;
    }

    get onFragGenerated() {
        return this._onFragGenerated;
    }

    set onFragGenerated(callback) {
        if (typeof callback !== 'function') {
            throw 'onFragGenerated must be a callback function!';
        }

        this._onFragGenerated = callback;
    }

    remux(audioTrack, videoTrack) {
        Log.v(this.TAG, `Received data, audioSize = ${audioTrack.length}, videoSize = ${videoTrack.length}, nbNalu = ${videoTrack.nbNalu}`);

        audioTrack.samples = [];
        audioTrack.length = 0;

        videoTrack.samples = [];
        videoTrack.length = 0;
        videoTrack.nbNalu = 0;
    }

}

export default MP4Remuxer;