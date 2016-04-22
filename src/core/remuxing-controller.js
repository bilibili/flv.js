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
    MEDIA_SEGMENT: 'media_segment',
    MEDIA_INFO: 'media_info',
    RECOMMEND_SEEKPOINT: 'recommend_seekpoint'
};

export class RemuxingController {

    constructor(url) {
        this.TAG = this.constructor.name;
        this._emitter = new EventEmitter();

        this._demuxer = null;
        this._remuxer = null;
        this._mediaInfo = null;

        this._ioctl = new IOController(url);
        this._ioctl.stashBufferEnabled = true;
        this._ioctl.onError = this._onIOException.bind(this);
        this._ioctl.onDataArrival = this._onInitChunkArrival.bind(this);
        this._ioctl.onSeeked = () => {
            if (this._remuxer) {
                this._remuxer.insertDiscontinuity();
            }
        };
    }

    destroy() {
        this._mediaInfo = null;
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
        this._emitter.removeAllListeners();
        this._emitter = null;
    }

    on(event, listener) {
        this._emitter.addListener(event, listener);
    }

    off(event, listener) {
        this._emitter.removeListener(event, listener);
    }

    start() {
        this._ioctl.open();
    }

    stop() {
        this._ioctl.abort();
        // TODO: clean up resources?
    }

    pause() {  // take a rest
        if (this._ioctl.isWorking()) {
            this._ioctl.pause();
        }
    }

    resume() {
        if (this._ioctl.isPaused()) {
            this._ioctl.resume();
        }
    }

    seek(milliseconds) {
        Log.v(this.TAG, 'Request seek time: ' + milliseconds);

        if (this._mediaInfo == null) {
            return;
        }
        if (!this._mediaInfo.isSeekable()) {
            return;
        }

        let position = this._mediaInfo.getNearestKeyframe(milliseconds);
        Log.v(this.TAG, 'Nearest keyframe time: ' + position.milliseconds);
        this._ioctl.seek(position.fileposition);
        this._emitter.emit(RemuxingEvents.RECOMMEND_SEEKPOINT, position.milliseconds);
    }

    _onInitChunkArrival(data, byteStart) {
        let probeData = null;

        if ((probeData = FlvDemuxer.probe(data)).match) {
            Log.v(this.TAG, 'Create FlvDemuxer');
            this._demuxer = new FlvDemuxer(probeData);
            this._remuxer = new MP4Remuxer();

            this._demuxer.onError = this._onDemuxException.bind(this);
            this._demuxer.onMediaInfo = this._onMediaInfo.bind(this);

            this._remuxer.bindDataSource(this._demuxer
                         .bindDataSource(this._ioctl
            ));

            this._remuxer.onInitSegment = this._onRemuxerInitSegmentArrival.bind(this);
            this._remuxer.onMediaSegment = this._onRemuxerMediaSegmentArrival.bind(this);
        } else {
            // non-flv, throw exception or trigger event
            // TODO: abort IO loading progress
            probeData = null;
            Log.e(this.TAG, 'Non-FLV, Unsupported media type!');
        }
        return probeData !== null ? probeData.consumed : 0;
    }

    _onIOException(type, info) {
        Log.e(this.TAG, `IOException: type = ${type}, code = ${info.code}, msg = ${info.msg}`);
        this._emitter.emit(RemuxingEvents.IO_ERROR, type, info);
    }

    _onDemuxException(type, info) {
        Log.e(this.TAG, `DemuxException: type = ${type}, info = ${info}`);
        this._emitter.emit(RemuxingEvents.DEMUX_ERROR, type, info);
    }

    _onMediaInfo(mediaInfo) {
        Log.v(this.TAG, 'onMediaInfo: ' + JSON.stringify(mediaInfo));
        this._mediaInfo = mediaInfo;
        this._emitter.emit(RemuxingEvents.MEDIA_INFO, mediaInfo);
    }

    _onRemuxerInitSegmentArrival(type, initSegment) {
        let is = initSegment;
        Log.v(this.TAG, `Init Segment: ${type}, codec/container: ${is.codec}/${is.container}`);
        this._emitter.emit(RemuxingEvents.INIT_SEGMENT, type, initSegment);
    }

    _onRemuxerMediaSegmentArrival(type, mediaSegment) {
        let ms = mediaSegment;
        let info = ms.info;
        Log.v(this.TAG, `Media Segment: ${type}, beginDts = ${info.beginDts}, beginPts = ${info.beginPts}, endDts = ${info.endDts}, endPts = ${info.endPts}`);
        this._emitter.emit(RemuxingEvents.MEDIA_SEGMENT, type, mediaSegment);
    }

}