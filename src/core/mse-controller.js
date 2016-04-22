import EventEmitter from 'events';
import Log from '../utils/logger.js';
import {SampleInfo, MediaSegmentInfo, MediaSegmentInfoList} from './media-segment-info.js';

const State = {
    ERROR: -2,
    STARTING: -1,
    IDLE: 0,
    KEY_LOADING: 1,
    FRAG_LOADING: 2,
    WAITING_LEVEL: 3,
    PARSING: 4,
    PARSED: 5,
    APPENDING: 6,
    BUFFER_FLUSHING: 7
};

// Media Source Extension controller
// Events: error, buffer_full, buffer_flushed
class MSEController {

    static isSupported() {
        return window.MediaSource && window.MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"');
    }

    constructor() {
        this.TAG = this.constructor.name;

        this._emitter = new EventEmitter();
        this.ERROR = 'error';
        this.BUFFER_FULL = 'buffer_full';
        this.BUFFER_FLUSHED = 'buffer_flushed';

        this.e = {};
        this.e.onSourceOpen = this._onSourceOpen.bind(this);
        this.e.onSourceEnded = this._onSourceEnded.bind(this);
        this.e.onSourceClose = this._onSourceClose.bind(this);
        this.e.onSourceBufferError = this._onSourceBufferError.bind(this);
        this.e.onSourceBufferUpdateEnd = this._onSourceBufferUpdateEnd.bind(this);

        let ms = this._mediaSource = new window.MediaSource();
        ms.addEventListener('sourceopen', this.e.onSourceOpen);
        ms.addEventListener('sourceended', this.e.onSourceEnded);
        ms.addEventListener('sourceclose', this.e.onSourceClose);

        this._mediaSourceObjectURL = null;
        this._mediaElement = null;

        this._isBufferFull = false;

        this._mimeTypes = {
            video: null,
            audio: null
        };
        this._sourceBuffers = {
            video: null,
            audio: null
        };
        this._pendingSegments = {
            video: [],
            audio: []
        };
        this._segmentInfoLists = {
            video: new MediaSegmentInfoList('video'),
            audio: new MediaSegmentInfoList('audio')
        };
    }

    destroy() {
        if (this._mediaSource) {
            let ms = this._mediaSource;
            if (ms.readyState === 'open') {
                try {
                    ms.endOfStream();
                } catch (error) {
                    Log.e(this.TAG, error.message);
                }
            }
            ms.removeEventListener('sourceopen', this.e.onSourceOpen);
            ms.removeEventListener('sourceended', this.e.onSourceEnded);
            ms.removeEventListener('sourceclose', this.e.onSourceClose);
        }
        if (this._mediaElement) {
            this.detachMediaElement();
        }
        this.e = null;
        this._emitter.removeAllListeners();
        this._emitter = null;
    }

    on(event, listener) {
        this._emitter.addListener(event, listener);
    }

    off(event, listener) {
        this._emitter.removeListener(event, listener);
    }

    attachMediaElement(mediaElement) {
        this._mediaElement = mediaElement;
        this._mediaSourceObjectURL = window.URL.createObjectURL(this._mediaSource);
        mediaElement.src = this._mediaSourceObjectURL;
    }

    detachMediaElement() {
        this._mediaElement.src = '';
        this._mediaElement = null;
        if (this._mediaSourceObjectURL) {
            window.URL.revokeObjectURL(this._mediaSourceObjectURL);
            this._mediaSourceObjectURL = null;
        }
    }

    appendInitSegment(initSegment) {
        let is = initSegment;
        let mimeType = `${is.container};codecs=${is.codec}`;
        let firstInitSegment = false;

        Log.v(this.TAG, 'Received Initialization Segment, mimetype: ' + mimeType);
        if (mimeType !== this._mimeTypes[is.type]) {
            if (!this._mimeTypes[is.type]) {  // empty, first chance create sourcebuffer
                firstInitSegment = true;
                try {
                    // TODO: MediaSource readyState checking
                    let sb = this._sourceBuffers[is.type] = this._mediaSource.addSourceBuffer(mimeType);
                    sb.addEventListener('error', this.e.onSourceBufferError);
                    sb.addEventListener('updateend', this.e.onSourceBufferUpdateEnd);
                } catch (error) {
                    Log.e(this.TAG, error.message);
                    this._emitter.emit(this.ERROR, {code: error.code, msg: error.message});
                    return;
                }
            } else {
                Log.v(this.TAG, `Notice: ${is.type} mimetype changed, origin: ${this._mimeTypes[is.type]}, target: ${mimeType}`);
            }
            this._mimeTypes[is.type] = mimeType;
        }

        this._pendingSegments[is.type].push(is);
        if (!firstInitSegment) {  // append immediately only if init segment in subsequence
            if (this._sourceBuffers[is.type] && !this._sourceBuffers[is.type].updating) {
                this._doAppendSegments();
            }
        }
    }

    appendMediaSegment(mediaSegment) {
        let ms = mediaSegment;
        let sb = this._sourceBuffers[ms.type];

        if (!sb) {
            // TODO: trigger error callback
            throw 'MSEController: No matching source buffer, maybe init segment missing!';
        }

        this._pendingSegments[ms.type].push(ms);
        if (!sb.updating) {
            this._doAppendSegments();
        }
    }

    _doAppendSegments() {
        let pendingSegments = this._pendingSegments;

        for (let type in pendingSegments) {
            if (!this._sourceBuffers[type] || this._sourceBuffers[type].updating) {
                continue;
            }
            if (pendingSegments[type].length > 0) {
                let segment = pendingSegments[type].shift();
                try {
                    this._sourceBuffers[type].appendBuffer(segment.data);
                    if (segment.hasOwnProperty('info')) {
                        this._segmentInfoLists[type].append(segment.info);
                    }
                    this._isBufferFull = false;
                } catch (error) {
                    this._pendingSegments[type].unshift(segment);
                    Log.e(this.TAG, error.message);
                    if (error.code === 22) {  // QuotaExceededError
                        // report buffer full, abort network IO
                        if (!this._isBufferFull) {
                            this._emitter.emit(this.BUFFER_FULL);
                        }
                        this._isBufferFull = true;
                    } else {
                        // TODO: fire an error
                        // TODO: need more detail
                        this._emitter.emit(this.ERROR, {code: error.code, msg: error.message});
                    }
                }
            }
        }
    }

    _onSourceOpen() {
        Log.v(this.TAG, 'MediaSource SourceOpen');
        this._mediaSource.removeEventListener('sourceopen', this.e.onSourceOpen);
    }

    _onSourceEnded() {
        Log.v(this.TAG, 'MediaSource SourceEnded');
    }

    _onSourceClose() {
        Log.v(this.TAG, 'MediaSource SourceClose');
        if (this._mediaSource && this.e != null) {
            this._mediaSource.removeEventListener('sourceopen', this.e.onSourceOpen);
            this._mediaSource.removeEventListener('sourceended', this.e.onSourceEnded);
            this._mediaSource.removeEventListener('sourceclose', this.e.onSourceClose);
        }
    }

    _hasPendingSegments() {
        let ps = this._pendingSegments;
        return ps.video.length > 0 || ps.audio.length > 0;
    }

    _onSourceBufferUpdateEnd() {
        Log.v(this.TAG, 'SourceBuffer UpdateEnd');
        // TODO: collect and report buffered ranges
        if (this._hasPendingSegments()) {
            this._doAppendSegments();
        }
    }

    _onSourceBufferError(e) {
        Log.e(this.TAG, 'SourceBuffer Error, msg = ' + e.message);
    }

}

export default MSEController;