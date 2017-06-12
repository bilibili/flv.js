/*
 * Copyright (C) 2016 Bilibili. All Rights Reserved.
 *
 * @author zheng qian <xqq@xqq.im>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import EventEmitter from 'events';
import Log from '../utils/logger.js';
import Browser from '../utils/browser.js';
import MSEEvents from './mse-events.js';
import {SampleInfo, IDRSampleList} from './media-segment-info.js';
import {IllegalStateException} from '../utils/exception.js';

// Media Source Extensions controller
class MSEController {

    constructor(config) {
        this.TAG = 'MSEController';

        this._config = config;
        this._emitter = new EventEmitter();

        if (this._config.isLive && this._config.autoCleanupSourceBuffer == undefined) {
            // For live stream, do auto cleanup by default
            this._config.autoCleanupSourceBuffer = true;
        }

        this.e = {
            onSourceOpen: this._onSourceOpen.bind(this),
            onSourceEnded: this._onSourceEnded.bind(this),
            onSourceClose: this._onSourceClose.bind(this),
            onSourceBufferError: this._onSourceBufferError.bind(this),
            onSourceBufferUpdateEnd: this._onSourceBufferUpdateEnd.bind(this)
        };

        this._mediaSource = null;
        this._mediaSourceObjectURL = null;
        this._mediaElement = null;

        this._isBufferFull = false;
        this._hasPendingEos = false;

        this._requireSetMediaDuration = false;
        this._pendingMediaDuration = 0;

        this._pendingSourceBufferInit = [];
        this._mimeTypes = {
            video: null,
            audio: null
        };
        this._sourceBuffers = {
            video: null,
            audio: null
        };
        this._lastInitSegments = {
            video: null,
            audio: null
        };
        this._pendingSegments = {
            video: [],
            audio: []
        };
        this._pendingRemoveRanges = {
            video: [],
            audio: []
        };
        this._idrList = new IDRSampleList();
    }

    destroy() {
        if (this._mediaElement || this._mediaSource) {
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
        if (this._mediaSource) {
            throw new IllegalStateException('MediaSource has been attached to an HTMLMediaElement!');
        }
        let ms = this._mediaSource = new window.MediaSource();
        ms.addEventListener('sourceopen', this.e.onSourceOpen);
        ms.addEventListener('sourceended', this.e.onSourceEnded);
        ms.addEventListener('sourceclose', this.e.onSourceClose);

        this._mediaElement = mediaElement;
        this._mediaSourceObjectURL = window.URL.createObjectURL(this._mediaSource);
        mediaElement.src = this._mediaSourceObjectURL;
    }

    detachMediaElement() {
        if (this._mediaSource) {
            let ms = this._mediaSource;
            for (let type in this._sourceBuffers) {
                // pending segments should be discard
                let ps = this._pendingSegments[type];
                ps.splice(0, ps.length);
                this._pendingSegments[type] = null;
                this._pendingRemoveRanges[type] = null;
                this._lastInitSegments[type] = null;

                // remove all sourcebuffers
                let sb = this._sourceBuffers[type];
                if (sb) {
                    if (ms.readyState !== 'closed') {
                        ms.removeSourceBuffer(sb);
                        sb.removeEventListener('error', this.e.onSourceBufferError);
                        sb.removeEventListener('updateend', this.e.onSourceBufferUpdateEnd);
                    }
                    this._mimeTypes[type] = null;
                    this._sourceBuffers[type] = null;
                }
            }
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
            this._pendingSourceBufferInit = [];
            this._isBufferFull = false;
            this._idrList.clear();
            this._mediaSource = null;
        }

        if (this._mediaElement) {
            this._mediaElement.src = '';
            this._mediaElement.removeAttribute('src');
            this._mediaElement = null;
        }
        if (this._mediaSourceObjectURL) {
            window.URL.revokeObjectURL(this._mediaSourceObjectURL);
            this._mediaSourceObjectURL = null;
        }
    }

    appendInitSegment(initSegment, deferred) {
        if (!this._mediaSource || this._mediaSource.readyState !== 'open') {
            // sourcebuffer creation requires mediaSource.readyState === 'open'
            // so we defer the sourcebuffer creation, until sourceopen event triggered
            this._pendingSourceBufferInit.push(initSegment);
            // make sure that this InitSegment is in the front of pending segments queue
            this._pendingSegments[initSegment.type].push(initSegment);
            return;
        }

        let is = initSegment;
        let mimeType = `${is.container}`;
        if (is.codec && is.codec.length > 0) {
            mimeType += `;codecs=${is.codec}`;
        }

        let firstInitSegment = false;

        Log.v(this.TAG, 'Received Initialization Segment, mimeType: ' + mimeType);
        this._lastInitSegments[is.type] = is;

        if (mimeType !== this._mimeTypes[is.type]) {
            if (!this._mimeTypes[is.type]) {  // empty, first chance create sourcebuffer
                firstInitSegment = true;
                try {
                    let sb = this._sourceBuffers[is.type] = this._mediaSource.addSourceBuffer(mimeType);
                    sb.addEventListener('error', this.e.onSourceBufferError);
                    sb.addEventListener('updateend', this.e.onSourceBufferUpdateEnd);
                } catch (error) {
                    Log.e(this.TAG, error.message);
                    this._emitter.emit(MSEEvents.ERROR, {code: error.code, msg: error.message});
                    return;
                }
            } else {
                Log.v(this.TAG, `Notice: ${is.type} mimeType changed, origin: ${this._mimeTypes[is.type]}, target: ${mimeType}`);
            }
            this._mimeTypes[is.type] = mimeType;
        }

        if (!deferred) {
            // deferred means this InitSegment has been pushed to pendingSegments queue
            this._pendingSegments[is.type].push(is);
        }
        if (!firstInitSegment) {  // append immediately only if init segment in subsequence
            if (this._sourceBuffers[is.type] && !this._sourceBuffers[is.type].updating) {
                this._doAppendSegments();
            }
        }
        if (Browser.safari && is.container === 'audio/mpeg' && is.mediaDuration > 0) {
            // 'audio/mpeg' track under Safari may cause MediaElement's duration to be NaN
            // Manually correct MediaSource.duration to make progress bar seekable, and report right duration
            this._requireSetMediaDuration = true;
            this._pendingMediaDuration = is.mediaDuration / 1000;  // in seconds
            this._updateMediaSourceDuration();
        }
    }

    appendMediaSegment(mediaSegment) {
        let ms = mediaSegment;
        this._pendingSegments[ms.type].push(ms);

        if (this._config.autoCleanupSourceBuffer && this._needCleanupSourceBuffer()) {
            this._doCleanupSourceBuffer();
        }

        let sb = this._sourceBuffers[ms.type];
        if (sb && !sb.updating && !this._hasPendingRemoveRanges()) {
            this._doAppendSegments();
        }
    }

    seek(seconds) {
        // remove all appended buffers
        for (let type in this._sourceBuffers) {
            if (!this._sourceBuffers[type]) {
                continue;
            }

            // abort current buffer append algorithm
            let sb = this._sourceBuffers[type];
            if (this._mediaSource.readyState === 'open') {
                try {
                    // If range removal algorithm is running, InvalidStateError will be throwed
                    // Ignore it.
                    sb.abort();
                } catch (error) {
                    Log.e(this.TAG, error.message);
                }
            }

            // IDRList should be clear
            this._idrList.clear();

            // pending segments should be discard
            let ps = this._pendingSegments[type];
            ps.splice(0, ps.length);

            if (this._mediaSource.readyState === 'closed') {
                // Parent MediaSource object has been detached from HTMLMediaElement
                continue;
            }

            // record ranges to be remove from SourceBuffer
            for (let i = 0; i < sb.buffered.length; i++) {
                let start = sb.buffered.start(i);
                let end = sb.buffered.end(i);
                this._pendingRemoveRanges[type].push({start, end});
            }

            // if sb is not updating, let's remove ranges now!
            if (!sb.updating) {
                this._doRemoveRanges();
            }

            // Safari 10 may get InvalidStateError in the later appendBuffer() after SourceBuffer.remove() call
            // Internal parser's state may be invalid at this time. Re-append last InitSegment to workaround.
            // Related issue: https://bugs.webkit.org/show_bug.cgi?id=159230
            if (Browser.safari) {
                let lastInitSegment = this._lastInitSegments[type];
                if (lastInitSegment) {
                    this._pendingSegments[type].push(lastInitSegment);
                    if (!sb.updating) {
                        this._doAppendSegments();
                    }
                }
            }
        }
    }

    endOfStream() {
        let ms = this._mediaSource;
        let sb = this._sourceBuffers;
        if (!ms || ms.readyState !== 'open') {
            if (ms && ms.readyState === 'closed' && this._hasPendingSegments()) {
                // If MediaSource hasn't turned into open state, and there're pending segments
                // Mark pending endOfStream, defer call until all pending segments appended complete
                this._hasPendingEos = true;
            }
            return;
        }
        if (sb.video && sb.video.updating || sb.audio && sb.audio.updating) {
            // If any sourcebuffer is updating, defer endOfStream operation
            // See _onSourceBufferUpdateEnd()
            this._hasPendingEos = true;
        } else {
            this._hasPendingEos = false;
            // Notify media data loading complete
            // This is helpful for correcting total duration to match last media segment
            // Otherwise MediaElement's ended event may not be triggered
            ms.endOfStream();
        }
    }

    getNearestKeyframe(dts) {
        return this._idrList.getLastSyncPointBeforeDts(dts);
    }

    _needCleanupSourceBuffer() {
        if (!this._config.autoCleanupSourceBuffer) {
            return false;
        }

        let currentTime = this._mediaElement.currentTime;

        for (let type in this._sourceBuffers) {
            let sb = this._sourceBuffers[type];
            if (sb) {
                let buffered = sb.buffered;
                if (buffered.length >= 1) {
                    if (currentTime - buffered.start(0) >= this._config.autoCleanupMaxBackwardDuration) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    _doCleanupSourceBuffer() {
        let currentTime = this._mediaElement.currentTime;

        for (let type in this._sourceBuffers) {
            let sb = this._sourceBuffers[type];
            if (sb) {
                let buffered = sb.buffered;
                let doRemove = false;

                for (let i = 0; i < buffered.length; i++) {
                    let start = buffered.start(i);
                    let end = buffered.end(i);

                    if (start <= currentTime && currentTime < end + 3) {  // padding 3 seconds
                        if (currentTime - start >= this._config.autoCleanupMaxBackwardDuration) {
                            doRemove = true;
                            let removeEnd = currentTime - this._config.autoCleanupMinBackwardDuration;
                            this._pendingRemoveRanges[type].push({start: start, end: removeEnd});
                        }
                    } else if (end < currentTime) {
                        doRemove = true;
                        this._pendingRemoveRanges[type].push({start: start, end: end});
                    }
                }

                if (doRemove && !sb.updating) {
                    this._doRemoveRanges();
                }
            }
        }
    }

    _updateMediaSourceDuration() {
        let sb = this._sourceBuffers;
        if (this._mediaElement.readyState === 0 || this._mediaSource.readyState !== 'open') {
            return;
        }
        if ((sb.video && sb.video.updating) || (sb.audio && sb.audio.updating)) {
            return;
        }

        let current = this._mediaSource.duration;
        let target = this._pendingMediaDuration;

        if (target > 0 && (isNaN(current) || target > current)) {
            Log.v(this.TAG, `Update MediaSource duration from ${current} to ${target}`);
            this._mediaSource.duration = target;
        }

        this._requireSetMediaDuration = false;
        this._pendingMediaDuration = 0;
    }

    _doRemoveRanges() {
        for (let type in this._pendingRemoveRanges) {
            if (!this._sourceBuffers[type] || this._sourceBuffers[type].updating) {
                continue;
            }
            let sb = this._sourceBuffers[type];
            let ranges = this._pendingRemoveRanges[type];
            while (ranges.length && !sb.updating) {
                let range = ranges.shift();
                sb.remove(range.start, range.end);
            }
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

                if (segment.timestampOffset) {
                    // For MPEG audio stream in MSE, if unbuffered-seeking occurred
                    // We need explicitly set timestampOffset to the desired point in timeline for mpeg SourceBuffer.
                    let currentOffset = this._sourceBuffers[type].timestampOffset;
                    let targetOffset = segment.timestampOffset / 1000;  // in seconds

                    let delta = Math.abs(currentOffset - targetOffset);
                    if (delta > 0.1) {  // If time delta > 100ms
                        Log.v(this.TAG, `Update MPEG audio timestampOffset from ${currentOffset} to ${targetOffset}`);
                        this._sourceBuffers[type].timestampOffset = targetOffset;
                    }
                    delete segment.timestampOffset;
                }

                if (!segment.data || segment.data.byteLength === 0) {
                    // Ignore empty buffer
                    continue;
                }

                try {
                    this._sourceBuffers[type].appendBuffer(segment.data);
                    this._isBufferFull = false;
                    if (type === 'video' && segment.hasOwnProperty('info')) {
                        this._idrList.appendArray(segment.info.syncPoints);
                    }
                } catch (error) {
                    this._pendingSegments[type].unshift(segment);
                    if (error.code === 22) {  // QuotaExceededError
                        /* Notice that FireFox may not throw QuotaExceededError if SourceBuffer is full
                         * Currently we can only do lazy-load to avoid SourceBuffer become scattered.
                         * SourceBuffer eviction policy may be changed in future version of FireFox.
                         *
                         * Related issues:
                         * https://bugzilla.mozilla.org/show_bug.cgi?id=1279885
                         * https://bugzilla.mozilla.org/show_bug.cgi?id=1280023
                         */

                        // report buffer full, abort network IO
                        if (!this._isBufferFull) {
                            this._emitter.emit(MSEEvents.BUFFER_FULL);
                        }
                        this._isBufferFull = true;
                    } else {
                        Log.e(this.TAG, error.message);
                        this._emitter.emit(MSEEvents.ERROR, {code: error.code, msg: error.message});
                    }
                }
            }
        }
    }

    _onSourceOpen() {
        Log.v(this.TAG, 'MediaSource onSourceOpen');
        this._mediaSource.removeEventListener('sourceopen', this.e.onSourceOpen);
        // deferred sourcebuffer creation / initialization
        if (this._pendingSourceBufferInit.length > 0) {
            let pendings = this._pendingSourceBufferInit;
            while (pendings.length) {
                let segment = pendings.shift();
                this.appendInitSegment(segment, true);
            }
        }
        // there may be some pending media segments, append them
        if (this._hasPendingSegments()) {
            this._doAppendSegments();
        }
        this._emitter.emit(MSEEvents.SOURCE_OPEN);
    }

    _onSourceEnded() {
        // fired on endOfStream
        Log.v(this.TAG, 'MediaSource onSourceEnded');
    }

    _onSourceClose() {
        // fired on detaching from media element
        Log.v(this.TAG, 'MediaSource onSourceClose');
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

    _hasPendingRemoveRanges() {
        let prr = this._pendingRemoveRanges;
        return prr.video.length > 0 || prr.audio.length > 0;
    }

    _onSourceBufferUpdateEnd() {
        if (this._requireSetMediaDuration) {
            this._updateMediaSourceDuration();
        } else if (this._hasPendingRemoveRanges()) {
            this._doRemoveRanges();
        } else if (this._hasPendingSegments()) {
            this._doAppendSegments();
        } else if (this._hasPendingEos) {
            this.endOfStream();
        }
        this._emitter.emit(MSEEvents.UPDATE_END);
    }

    _onSourceBufferError(e) {
        Log.e(this.TAG, `SourceBuffer Error: ${e}`);
        // this error might not always be fatal, just ignore it
    }

}

export default MSEController;