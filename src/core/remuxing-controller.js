import EventEmitter from 'events';
import Log from '../utils/logger.js';
import MediaInfo from './media-info.js';
import FlvDemuxer from '../demux/flv-demuxer.js';
import MP4Remuxer from '../remux/mp4-remuxer.js';
import IOController from '../io/io-controller.js';
import {LoaderStatus, LoaderError} from '../io/loader.js';

export const RemuxingEvents = {
    IO_ERROR: 'io_error',
    DEMUX_ERROR: 'demux_error',
    INIT_SEGMENT: 'init_segment',
    MEDIA_SEGMENT: 'media_segment'
};

export class RemuxingController extends EventEmitter {

    constructor(url) {
        super();
        this.TAG = this.constructor.name;

        this._demuxer = null;
        this._remuxer = null;

        this._ioctl = new IOController(url);
        this._ioctl.stashBufferEnabled = true;
        this._ioctl.onError = this._onIOException.bind(this);
        this._ioctl.onDataArrival = this._onInitChunkArrival.bind(this);
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
        this.removeAllListeners();
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
        if (this._ioctl.isWorking()) {
            this._ioctl.seek(milliseconds);
        } else {
            throw 'IOController is not working, unable to seek';
        }
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

            this._remuxer.onInitSegment = this._onRemuxerInitSegmentArrival.bind(this);
            this._remuxer.onMediaSegment = this._onRemuxerMediaSegmentArrival.bind(this);
        } else {
            // non-flv, throw exception or trigger event
            probeData = null;
            Log.e(this.TAG, 'Non-FLV, Unsupported media type!');
        }
        return probeData !== null ? probeData.consumed : 0;
    }

    _onIOException(type, info) {
        Log.e(this.TAG, `IOException: type = ${type}, code = ${info.code}, msg = ${info.msg}`);
        this.emit(RemuxingEvents.IO_ERROR, type, info);
    }

    _onDemuxException(type, info) {
        Log.e(this.TAG, `DemuxException: name = ${this._demuxer.TAG}, type = ${type}, info = ${info}`);
        this.emit(RemuxingEvents.DEMUX_ERROR, type, info);
    }

    _onRemuxerInitSegmentArrival(type, initSegment) {
        Log.v(this.TAG, `Init Segment: ${type}, size = ${initSegment.byteLength}`);
        this.emit(RemuxingEvents.INIT_SEGMENT, type, initSegment);
    }

    _onRemuxerMediaSegmentArrival(type, mediaSegment) {
        Log.v(this.TAG, `Media Segment: ${type}, size = ${mediaSegment.data.byteLength}`);
        this.emit(RemuxingEvents.MEDIA_SEGMENT, type, mediaSegment);
    }

}