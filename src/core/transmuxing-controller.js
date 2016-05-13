import EventEmitter from 'events';
import Log from '../utils/logger.js';
import MediaInfo from './media-info.js';
import FlvDemuxer from '../demux/flv-demuxer.js';
import MP4Remuxer from '../remux/mp4-remuxer.js';
import IOController from '../io/io-controller.js';
import {LoaderStatus, LoaderError} from '../io/loader.js';

export const TransmuxingEvents = {
    IO_ERROR: 'io_error',
    DEMUX_ERROR: 'demux_error',
    INIT_SEGMENT: 'init_segment',
    MEDIA_SEGMENT: 'media_segment',
    MEDIA_INFO: 'media_info',
    RECOMMEND_SEEKPOINT: 'recommend_seekpoint'
};

// Transmuxing (IO, Demuxing, Remuxing) controller, with multipart support
export class TransmuxingController {

    constructor(mediaDataSource) {
        this.TAG = this.constructor.name;
        this._emitter = new EventEmitter();

        // treat single part media as multipart media, which has only one segment
        if (!mediaDataSource.segments) {
            mediaDataSource.segments = [{
                duration: mediaDataSource.duration,
                filesize: mediaDataSource.filesize,
                url: mediaDataSource.url
            }];
        }

        // fill in default IO params if not exists
        if (typeof mediaDataSource.cors !== 'boolean') {
            mediaDataSource.cors = true;
        }
        if (typeof mediaDataSource.withCredentials !== 'boolean') {
            mediaDataSource.withCredentials = false;
        }

        this._mediaDataSource = mediaDataSource;
        this._currentSegmentIndex = 0;
        let totalDuration = 0;

        this._mediaDataSource.segments.forEach((segment) => {
            // timestampBase for each segment, and calculate total duration
            segment.timestampBase = totalDuration;
            totalDuration += segment.duration;
            // params needed by IOController
            segment.cors = mediaDataSource.cors;
            segment.withCredentials = mediaDataSource.withCredentials;
        });

        if (!isNaN(totalDuration) && this._mediaDataSource.duration !== totalDuration) {
            this._mediaDataSource.duration = totalDuration;
        }

        this._mediaInfo = null;
        this._demuxer = null;
        this._remuxer = null;
        this._ioctl = null;

        this._pendingSeekTime = null;
    }

    destroy() {
        this._mediaInfo = null;
        this._mediaDataSource = null;

        if (this._ioctl) {
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
        this._loadSegment(0);
    }

    _loadSegment(segmentIndex, optionalFrom) {
        this._currentSegmentIndex = segmentIndex;
        let dataSource = this._mediaDataSource.segments[segmentIndex];

        let ioctl = this._ioctl = new IOController(dataSource, segmentIndex);
        ioctl.onError = this._onIOException.bind(this);
        ioctl.onSeeked = this._onIOSeeked.bind(this);
        ioctl.onComplete = this._onIOComplete.bind(this);

        if (optionalFrom) {
            this._demuxer.bindDataSource(this._ioctl);
        } else {
            ioctl.onDataArrival = this._onInitChunkArrival.bind(this);
        }

        ioctl.open(optionalFrom);
    }

    stop() {
        this._internalAbort();
    }

    _internalAbort() {
        if (this._ioctl) {
            this._ioctl.destroy();
            this._ioctl = null;
        }
    }

    pause() {  // take a rest
        if (this._ioctl && this._ioctl.isWorking()) {
            this._ioctl.pause();
        }
    }

    resume() {
        if (this._ioctl && this._ioctl.isPaused()) {
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

        let targetSegmentIndex = this._searchSegmentIndexContains(milliseconds);

        if (targetSegmentIndex === this._currentSegmentIndex) {
            // intra-segment seeking
            Log.v(this.TAG, 'Intra-segment seeking, segment index: ' + targetSegmentIndex);
            let segmentInfo = this._mediaInfo.segments[targetSegmentIndex];

            if (segmentInfo == undefined) {
                // current segment loading started, but mediainfo hasn't received yet
                // wait for the metadata loaded, then seek to expected position
                this._pendingSeekTime = milliseconds;
            } else {
                let keyframe = segmentInfo.getNearestKeyframe(milliseconds);
                Log.v(this.TAG, 'Nearest keyframe time: ' + keyframe.milliseconds);
                this._remuxer.seek(keyframe.milliseconds);
                this._ioctl.seek(keyframe.fileposition);
                this._emitter.emit(TransmuxingEvents.RECOMMEND_SEEKPOINT, keyframe.milliseconds);
            }
        } else {
            // cross-segment seeking
            Log.v(this.TAG, 'Cross-segment seeking, target segment index: ' + targetSegmentIndex);
            let targetSegmentInfo = this._mediaInfo.segments[targetSegmentIndex];

            if (targetSegmentInfo == undefined) {
                // target segment hasn't been loaded. We need metadata then seek to expected time 
                Log.v(this.TAG, 'Target segment hasn\'t be loaded. We need metadata then seek to expected time');
                this._pendingSeekTime = milliseconds;
                this._internalAbort();
                this._remuxer.seek();
                this._remuxer.insertDiscontinuity();
                this._loadSegment(targetSegmentIndex);
                // Here we wait for the metadata loaded, then seek to expected position
            } else {
                // We have target segment's metadata, direct seek to target position
                Log.v(this.TAG, 'We have metadata, direct seek to target position');
                let keyframe = targetSegmentInfo.getNearestKeyframe(milliseconds);
                Log.v(this.TAG, 'Nearest keyframe time: ' + keyframe.milliseconds);
                this._internalAbort();
                this._remuxer.seek(milliseconds);
                this._remuxer.insertDiscontinuity();
                this._demuxer.timestampBase = this._mediaDataSource.segments[targetSegmentIndex].timestampBase;
                this._loadSegment(targetSegmentIndex, keyframe.fileposition);
                this._emitter.emit(TransmuxingEvents.RECOMMEND_SEEKPOINT, keyframe.milliseconds);
            }
        }
    }

    _searchSegmentIndexContains(milliseconds) {
        let segments = this._mediaDataSource.segments;
        let idx = segments.length - 1;

        for (let i = 0; i < segments.length; i++) {
            if (milliseconds < segments[i].timestampBase) {
                idx = i - 1;
                break;
            }
        }
        return idx;
    }

    _onInitChunkArrival(data, byteStart) {
        let probeData = null;

        if ((probeData = FlvDemuxer.probe(data)).match) {
            // Always create new FlvDemuxer
            Log.v(this.TAG, 'Create FlvDemuxer');
            this._demuxer = new FlvDemuxer(probeData);

            if (!this._remuxer) {
                Log.v(this.TAG, 'Create MP4Remuxer');
                this._remuxer = new MP4Remuxer();
            }

            let mds = this._mediaDataSource;
            if (mds.duration != undefined && !isNaN(mds.duration)) {
                this._demuxer.overridedDuration = mds.duration;
            }
            this._demuxer.timestampBase = mds.segments[this._currentSegmentIndex].timestampBase;

            this._demuxer.onError = this._onDemuxException.bind(this);
            this._demuxer.onMediaInfo = this._onMediaInfo.bind(this);

            this._remuxer.bindDataSource(this._demuxer
                         .bindDataSource(this._ioctl
            ));

            this._remuxer.onInitSegment = this._onRemuxerInitSegmentArrival.bind(this);
            this._remuxer.onMediaSegment = this._onRemuxerMediaSegmentArrival.bind(this);
        } else {
            probeData = null;
            Log.e(this.TAG, 'Non-FLV, Unsupported media type!');
            Promise.resolve().then(() => {
                this._internalAbort();
            });
            this._emitter.emit(TransmuxingEvents.DEMUX_ERROR, 'Non-FLV, Unsupported media type');
        }

        return probeData != null ? probeData.consumed : 0;
    }

    _onMediaInfo(mediaInfo) {
        Log.v(this.TAG, 'onMediaInfo: ' + JSON.stringify(mediaInfo));

        if (this._mediaInfo == null) {
            // Store first segment's mediainfo as global mediaInfo
            this._mediaInfo = Object.assign({}, mediaInfo);
            this._mediaInfo.keyframeIndex = null;
            this._mediaInfo.segments = [];
            Object.setPrototypeOf(this._mediaInfo, MediaInfo.prototype);
        }

        if (this._mediaInfo.segments[this._currentSegmentIndex] == undefined) {
            let segmentInfo = Object.assign({}, mediaInfo);
            Object.setPrototypeOf(segmentInfo, MediaInfo.prototype);

            this._mediaInfo.segments[this._currentSegmentIndex] = segmentInfo;
        }

        if (this._pendingSeekTime != null) {
            let target = this._pendingSeekTime;
            this._pendingSeekTime = null;
            Promise.resolve().then(() => {
                this.seek(target);
            });
        }

        this._emitter.emit(TransmuxingEvents.MEDIA_INFO, this._mediaInfo);
    }

    _onIOSeeked() {
        this._remuxer.insertDiscontinuity();
    }

    _onIOComplete(extraData) {
        Log.v(this.TAG, 'IOController complete, segment index = ' + extraData);
        let segmentIndex = extraData;
        let nextSegmentIndex = segmentIndex + 1;

        if (nextSegmentIndex < this._mediaDataSource.segments.length) {
            Log.v(this.TAG, 'Continue load next segment, idx = ' + nextSegmentIndex);
            this._internalAbort();
            this._loadSegment(nextSegmentIndex);
        }
    }

    _onIOException(type, info) {
        Log.e(this.TAG, `IOException: type = ${type}, code = ${info.code}, msg = ${info.msg}`);
        this._emitter.emit(TransmuxingEvents.IO_ERROR, type, info);
    }

    _onDemuxException(type, info) {
        Log.e(this.TAG, `DemuxException: type = ${type}, info = ${info}`);
        this._emitter.emit(TransmuxingEvents.DEMUX_ERROR, type, info);
    }

    _onRemuxerInitSegmentArrival(type, initSegment) {
        let is = initSegment;
        Log.v(this.TAG, `Init Segment: ${type}, mimeType: ${is.container};codecs=${is.codec}`);
        this._emitter.emit(TransmuxingEvents.INIT_SEGMENT, type, initSegment);
    }

    _onRemuxerMediaSegmentArrival(type, mediaSegment) {
        let ms = mediaSegment;
        let info = ms.info;
        Log.v(this.TAG, `Media Segment: ${type}, beginDts = ${info.beginDts}, beginPts = ${info.beginPts}, endDts = ${info.endDts}, endPts = ${info.endPts}`);
        this._emitter.emit(TransmuxingEvents.MEDIA_SEGMENT, type, mediaSegment);
    }

}