import EventEmitter from 'events';
import Log from '../utils/logger.js';
import PlayerEvents from './player-events.js';
import Transmuxer from '../core/transmuxer.js';
import TransmuxingEvents from '../core/transmuxing-events.js';
import MSEController from '../core/mse-controller.js';
import MSEEvents from '../core/mse-events.js';
import {ErrorTypes, ErrorDetails} from './player-errors.js';
import Browser from '../utils/browser.js';
import {createDefaultConfig} from '../config.js';
import {InvalidArgumentException, IllegalStateException} from '../utils/exception.js';

class FlvPlayer {

    constructor(mediaDataSource, config) {
        this.TAG = this.constructor.name;
        this._type = 'FlvPlayer';
        this._emitter = new EventEmitter();

        this._config = createDefaultConfig();
        if (typeof config === 'object') {
            Object.assign(this._config, config);
        }

        if (mediaDataSource.type.toLowerCase() !== 'flv') {
            throw new InvalidArgumentException('FlvPlayer requires an flv MediaDataSource input!');
        }

        if (mediaDataSource.isLive === true) {
            this._config.isLive = true;
        }

        this.e = {
            onvSeeking: this._onvSeeking.bind(this)
        };

        if (self.performance && self.performance.now) {
            this._now = self.performance.now.bind(self.performance);
        } else {
            this._now = Date.now;
        }

        this._pendingSeekTime = null;  // in seconds
        this._requestSetTime = false;
        this._seekpointRecord = null;
        this._statisticsReporter = null;
        this._progressChecker = null;

        this._hasStatisticsListener = false;

        this._mediaDataSource = mediaDataSource;
        this._mediaElement = null;
        this._msectl = null;
        this._transmuxer = null;

        this._mseSourceOpened = false;
        this._hasPendingLoad = false;

        this._mediaInfo = null;
        this._statisticsInfo = null;

        let chromeNeedIDRFix = (Browser.chrome &&
                               (Browser.version.major < 50 ||
                               (Browser.version.major === 50 && Browser.version.build < 2661)));
        this._alwaysSeekKeyframe = (chromeNeedIDRFix || Browser.msedge || Browser.msie) ? true : false;

        if (this._alwaysSeekKeyframe) {
            this._config.accurateSeek = false;
        }
    }

    destroy() {
        if (this._progressChecker != null) {
            window.clearInterval(this._progressChecker);
            this._progressChecker = null;
        }
        if (this._transmuxer) {
            this.unload();
        }
        if (this._mediaElement) {
            this.detachMediaElement();
        }
        this.e = null;
        this._mediaDataSource = null;

        this._emitter.removeAllListeners();
        this._emitter = null;
    }

    on(event, listener) {
        if (event === PlayerEvents.MEDIA_INFO) {
            if (this._mediaInfo != null) {
                Promise.resolve().then(() => {
                    this._emitter.emit(PlayerEvents.MEDIA_INFO, this.mediaInfo);
                });
            }
        } else if (event === PlayerEvents.STATISTICS_INFO) {
            this._hasStatisticsListener = true;
            if (this._statisticsInfo != null) {
                Promise.resolve().then(() => {
                    this._emitter.emit(PlayerEvents.STATISTICS_INFO, this.statisticsInfo);
                });
            }
            if (this._statisticsReporter == null) {
                this._statisticsReporter = window.setInterval(
                    this._reportStatisticsInfo.bind(this),
                this._config.statisticsInfoReportInterval);
            }
        }
        this._emitter.addListener(event, listener);
    }

    off(event, listener) {
        if (event === PlayerEvents.STATISTICS_INFO) {
            this._hasStatisticsListener = false;
            if (this._statisticsReporter != null) {
                window.clearInterval(this._statisticsReporter);
                this._statisticsReporter = null;
            }
        }
        this._emitter.removeListener(event, listener);
    }

    attachMediaElement(mediaElement) {
        this._mediaElement = mediaElement;
        mediaElement.addEventListener('seeking', this.e.onvSeeking);

        this._msectl = new MSEController();

        this._msectl.on(MSEEvents.UPDATE_END, this._onmseUpdateEnd.bind(this));
        this._msectl.on(MSEEvents.BUFFER_FULL, this._onmseBufferFull.bind(this));
        this._msectl.on(MSEEvents.SOURCE_OPEN, () => {
            this._mseSourceOpened = true;
            if (this._hasPendingLoad) {
                this._hasPendingLoad = false;
                this.load();
            }
        });
        this._msectl.on(MSEEvents.ERROR, (info) => {
            this._emitter.emit(PlayerEvents.ERROR,
                               ErrorTypes.MEDIA_ERROR,
                               ErrorDetails.MEDIA_MSE_ERROR,
                               info
            );
        });

        this._msectl.attachMediaElement(mediaElement);

        if (this._pendingSeekTime != null) {
            mediaElement.currentTime = this._pendingSeekTime;
            this._pendingSeekTime = null;
        }
    }

    detachMediaElement() {
        if (this._mediaElement) {
            this._msectl.detachMediaElement();
            this._mediaElement.removeEventListener('seeking', this.e.onvSeeking);
            this._mediaElement = null;
        }
        if (this._msectl) {
            this._msectl.destroy();
            this._msectl = null;
        }
    }

    load() {
        if (!this._mediaElement) {
            throw new IllegalStateException('HTMLMediaElement must be attached before load()!');
        }
        if (this._transmuxer) {
            throw new IllegalStateException('FlvPlayer.load() has been called, please call unload() first!');
        }
        if (this._hasPendingLoad) {
            return;
        }

        if (this._config.deferLoadAfterSourceOpen && this._mseSourceOpened === false) {
            this._hasPendingLoad = true;
            return;
        }

        if (this._mediaElement.readyState > 0) {
            this._requestSetTime = true;
            // IE11 may throw InvalidStateError if readyState === 0
            this._mediaElement.currentTime = 0;
        }

        this._transmuxer = new Transmuxer(this._mediaDataSource, this._config);

        this._transmuxer.on(TransmuxingEvents.INIT_SEGMENT, (type, is) => {
            this._msectl.appendInitSegment(is);
        });
        this._transmuxer.on(TransmuxingEvents.MEDIA_SEGMENT, (type, ms) => {
            this._msectl.appendMediaSegment(ms);

            if (this._hasStatisticsListener && this._statisticsReporter == null) {
                if (this._progressChecker == null) {
                    this._statisticsReporter = window.setInterval(
                        this._reportStatisticsInfo.bind(this),
                    this._config.statisticsInfoReportInterval);
                }
            }

            // lazyLoad check
            if (this._config.lazyLoad && !this._config.isLive) {
                let currentTime = this._mediaElement.currentTime;
                if (ms.info.endDts >= (currentTime + this._config.lazyLoadMaxDuration) * 1000) {
                    if (this._progressChecker == null) {
                        Log.v(this.TAG, 'Maximum buffering duration exceeded, suspend transmuxing task');
                        this._suspendTransmuxer();
                    }
                }
            }
        });
        this._transmuxer.on(TransmuxingEvents.LOADING_COMPLETE, () => {
            Log.v(this.TAG, 'Loading Complete!');
            this._msectl.endOfStream();
            if (this._statisticsReporter != null) {
                window.clearInterval(this._statisticsReporter);
                this._statisticsReporter = null;
            }
        });
        this._transmuxer.on(TransmuxingEvents.IO_ERROR, (detail, info) => {
            this._emitter.emit(PlayerEvents.ERROR, ErrorTypes.NETWORK_ERROR, detail, info);
        });
        this._transmuxer.on(TransmuxingEvents.DEMUX_ERROR, (detail, info) => {
            this._emitter.emit(PlayerEvents.ERROR, ErrorTypes.MEDIA_ERROR, detail, {code: -1, msg: info});
        });
        this._transmuxer.on(TransmuxingEvents.MEDIA_INFO, (mediaInfo) => {
            this._mediaInfo = mediaInfo;
            this._emitter.emit(PlayerEvents.MEDIA_INFO, mediaInfo);
        });
        this._transmuxer.on(TransmuxingEvents.STATISTICS_INFO, (statInfo) => {
            this._statisticsInfo = this._fillStatisticsInfo(statInfo);
        });
        this._transmuxer.on(TransmuxingEvents.RECOMMEND_SEEKPOINT, (milliseconds) => {
            if (this._mediaElement && !this._config.accurateSeek) {
                this._requestSetTime = true;
                this._mediaElement.currentTime = milliseconds / 1000;
            }
        });

        this._transmuxer.open();
    }

    unload() {
        if (this._statisticsReporter != null) {
            window.clearInterval(this._statisticsReporter);
            this._statisticsReporter = null;
        }
        if (this._mediaElement) {
            this._mediaElement.pause();
        }
        if (this._msectl) {
            this._msectl.seek(0);
        }
        if (this._transmuxer) {
            this._transmuxer.close();
            this._transmuxer.destroy();
            this._transmuxer = null;
        }
    }

    play() {
        this._mediaElement.play();
    }

    pause() {
        this._mediaElement.pause();
    }

    get type() {
        return this._type;
    }

    get buffered() {
        return this._mediaElement.buffered;
    }

    get duration() {
        return this._mediaElement.duration;
    }

    get volume() {
        return this._mediaElement.volume;
    }

    set volume(value) {
        this._mediaElement.volume = value;
    }

    get muted() {
        return this._mediaElement.muted;
    }

    set muted(muted) {
        this._mediaElement.muted = muted;
    }

    get currentTime() {
        if (this._mediaElement) {
            return this._mediaElement.currentTime;
        }
        return 0;
    }

    set currentTime(seconds) {
        if (this._mediaElement) {
            this._internalSeek(seconds);
        } else {
            this._pendingSeekTime = seconds;
        }
    }

    get mediaInfo() {
        return Object.assign({}, this._mediaInfo);
    }

    get statisticsInfo() {
        if (this._statisticsInfo == null) {
            this._statisticsInfo = {};
        }
        this._statisticsInfo = this._fillStatisticsInfo(this._statisticsInfo);
        return Object.assign({}, this._statisticsInfo);
    }

    _fillStatisticsInfo(statInfo) {
        statInfo.playerType = this._type;

        let hasQualityInfo = true;
        let decoded = 0;
        let dropped = 0;

        if (this._mediaElement.getVideoPlaybackQuality) {
            let quality = this._mediaElement.getVideoPlaybackQuality();
            decoded = quality.totalVideoFrames;
            dropped = quality.droppedVideoFrames;
        } else if (this._mediaElement.webkitDecodedFrameCount != undefined) {
            decoded = this._mediaElement.webkitDecodedFrameCount;
            dropped = this._mediaElement.webkitDroppedFrameCount;
        } else {
            hasQualityInfo = false;
        }

        if (hasQualityInfo) {
            statInfo.decodedFrames = decoded;
            statInfo.droppedFrames = dropped;
        }

        return statInfo;
    }

    _reportStatisticsInfo() {
        if (this._statisticsInfo != null) {
            this._emitter.emit(PlayerEvents.STATISTICS_INFO, this.statisticsInfo);
        }
    }

    _onmseUpdateEnd() {
        if (!this._config.lazyLoad || this._config.isLive) {
            return;
        }

        let buffered = this._mediaElement.buffered;
        let currentTime = this._mediaElement.currentTime;
        let currentRangeStart = 0;
        let currentRangeEnd = 0;

        for (let i = 0; i < buffered.length; i++) {
            let start = buffered.start(i);
            let end = buffered.end(i);
            if (start <= currentTime && currentTime < end) {
                currentRangeStart = start;
                currentRangeEnd = end;
                break;
            }
        }

        if (currentRangeEnd >= currentTime + this._config.lazyLoadMaxDuration && this._progressChecker == null) {
            Log.v(this.TAG, 'Maximum buffering duration exceeded, suspend transmuxing task');
            this._suspendTransmuxer();
        }
    }

    _onmseBufferFull() {
        Log.v(this.TAG, 'MSE SourceBuffer is full, suspend transmuxing task');
        if (this._progressChecker == null) {
            this._suspendTransmuxer();
        }
    }

    _suspendTransmuxer() {
        if (this._transmuxer) {
            this._transmuxer.pause();

            if (this._statisticsReporter != null) {
                window.clearInterval(this._statisticsReporter);
                this._statisticsReporter = null;
            }

            if (this._progressChecker == null) {
                this._progressChecker = window.setInterval(this._checkProgressAndResume.bind(this), 1000);
            }
        }
    }

    _checkProgressAndResume() {
        let currentTime = this._mediaElement.currentTime;
        let buffered = this._mediaElement.buffered;

        let needResume = false;

        for (let i = 0; i < buffered.length; i++) {
            let from = buffered.start(i);
            let to = buffered.end(i);
            if (currentTime >= from && currentTime < to) {
                if (currentTime >= to - 30) {
                    needResume = true;
                }
                break;
            }
        }

        if (needResume) {
            window.clearInterval(this._progressChecker);
            this._progressChecker = null;
            if (needResume) {
                Log.v(this.TAG, 'Continue loading from paused position');
                this._transmuxer.resume();
            }
        }
    }

    _isTimepointBuffered(seconds) {
        let buffered = this._mediaElement.buffered;

        for (let i = 0; i < buffered.length; i++) {
            let from = buffered.start(i);
            let to = buffered.end(i);
            if (seconds >= from && seconds < to) {
                return true;
            }
        }
        return false;
    }

    _internalSeek(seconds) {
        let directSeek = this._isTimepointBuffered(seconds);

        if (directSeek) {  // buffered position
            if (!this._alwaysSeekKeyframe) {
                this._requestSetTime = true;
                this._mediaElement.currentTime = seconds;
            } else {
                let idr = this._msectl.getNearestKeyframe(Math.floor(seconds * 1000));
                this._requestSetTime = true;
                if (idr != null) {
                    this._mediaElement.currentTime = idr.dts / 1000;
                } else {
                    this._mediaElement.currentTime = seconds;
                }
            }
            if (this._progressChecker != null) {
                this._checkProgressAndResume();
            }
        } else {
            if (this._progressChecker != null) {
                window.clearInterval(this._progressChecker);
                this._progressChecker = null;
            }
            this._msectl.seek(seconds);
            this._transmuxer.seek(Math.floor(seconds * 1000));  // in milliseconds
            // no need to set mediaElement.currentTime if non-accurateSeek,
            // just wait for the recommend_seekpoint callback
            if (this._config.accurateSeek) {
                this._requestSetTime = true;
                this._mediaElement.currentTime = seconds;
            }
        }
    }

    _checkAndApplyUnbufferedSeekpoint() {
        if (this._seekpointRecord) {
            if (this._seekpointRecord.recordTime <= this._now() - 100) {
                let target = this._mediaElement.currentTime;
                this._seekpointRecord = null;
                if (!this._isTimepointBuffered(target)) {
                    if (this._progressChecker != null) {
                        window.clearTimeout(this._progressChecker);
                        this._progressChecker = null;
                    }
                    // .currentTime is consists with .buffered timestamp
                    // Chrome/Edge use DTS, while FireFox/Safari use PTS
                    this._msectl.seek(target);
                    this._transmuxer.seek(Math.floor(target * 1000));
                    // set currentTime if accurateSeek, or wait for recommend_seekpoint callback
                    if (this._config.accurateSeek) {
                        this._requestSetTime = true;
                        this._mediaElement.currentTime = target;
                    }
                }
            } else {
                window.setTimeout(this._checkAndApplyUnbufferedSeekpoint.bind(this), 50);
            }
        }
    }

    _onvSeeking(e) {  // handle seeking request from browser's progress bar
        let target = this._mediaElement.currentTime;
        if (this._requestSetTime) {
            this._requestSetTime = false;
            return;
        }
        if (this._isTimepointBuffered(target)) {
            if (this._alwaysSeekKeyframe) {
                let idr = this._msectl.getNearestKeyframe(Math.floor(target * 1000));
                if (idr != null) {
                    this._requestSetTime = true;
                    this._mediaElement.currentTime = idr.dts / 1000;
                }
            }
            if (this._progressChecker != null) {
                this._checkProgressAndResume();
            }
            return;
        }

        this._seekpointRecord = {
            seekPoint: target,
            recordTime: this._now()
        };
        window.setTimeout(this._checkAndApplyUnbufferedSeekpoint.bind(this), 50);
    }

}

export default FlvPlayer;