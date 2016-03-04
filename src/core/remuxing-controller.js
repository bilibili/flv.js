import Log from '../utils/logger.js';
import EventEmitter from 'events';
import MediaInfo from './media-info.js';
import FlvDemuxer from '../demux/flv-demuxer.js';
import MP4Remuxer from '../remux/mp4-remuxer.js';
import IOController from '../io/io-controller.js';
import {LoaderStatus, LoaderError} from '../io/loader.js';

// Manage IO, Demuxing, and Remuxing. Especially demuxer and remuxer.
class RemuxingController {

    constructor(url) {
        this.TAG = this.constructor.name;
        this._ioctl = new IOController(url);
        this._ioctl.stashBufferEnabled = true;
        this._ioctl.onError = this._onIOException.bind(this);
        this._ioctl.onDataArrival = this._onInitChunkArrival.bind(this);
        this._demuxer = null;
        this._remuxer = null;
    }

    destroy() {
        if (this._ioctl) {
            if (this._ioctl.isWorking()) {
                this._ioctl.abort();
            }
            this._ioctl.destroy();
            this._ioctl = null;
        }
        if (this._demuxer) {
            this._demuxer.destroy();
            this._demuxer = null;
        }
        if (this._remuxer) {
            this._remuxer.destroy();
            this._remuxer = null;
        }
    }

    start() {
        this._ioctl.open();
    }

    stop() {
        this._ioctl.abort();
        // TODO: clean up resources?
    }

    seek(milliseconds) {
        // TODO: Get bytes position from MediaInfo.KeyframesIndex
        // this._ioctl.seek(bytes);
        this._ioctl.seek(milliseconds);
    }

    _onInitChunkArrival(data, byteStart) {
        let probeData = null;

        if ((probeData = FlvDemuxer.probe(data)).match) {
            Log.v(this.TAG, 'Create FLVDemuxer');
            this._demuxer = new FlvDemuxer(probeData);
            this._remuxer = new MP4Remuxer();

            this._demuxer.onError = this._onDemuxException.bind(this);

            this._remuxer.bindDataSource(this._demuxer
                         .bindDataSource(this._ioctl
            ));

            this._remuxer.onFragGenerated = this._onRemuxerFragmentArrival.bind(this);
        } else {
            // non-flv, throw exception or trigger event
            probeData = null;
            Log.e(this.TAG, 'Non-FLV, Unsupported media type!');
        }
        return probeData !== null ? probeData.consumed : 0;
    }

    _onIOException(type, info) {
        Log.e(this.TAG, `IOException: type = ${type}, code = ${info.code}, msg = ${info.msg}`);
    }

    _onDemuxException(type, info) {
        Log.e(this.TAG, `DemuxException: name = ${this._demuxer.TAG}, type = ${type}, info = ${info}`);
    }

    _onRemuxerFragmentArrival(frag) {

    }

}

export default RemuxingController;