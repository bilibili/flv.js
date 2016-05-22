import EventEmitter from 'events';
import {InvalidArgumentException, IllegalStateException} from '../utils/exception.js';

// Player wrapper for browser's native player (HTMLVideoElement) without MediaSource src. 
class NativePlayer {

    constructor(mediaDataSource) {
        this.TAG = this.constructor.name;
        this._type = 'NativePlayer';
        this._emitter = new EventEmitter();

        if (mediaDataSource.type.toLowerCase() === 'flv') {
            throw new InvalidArgumentException('NativePlayer does\'t support flv MediaDataSource input!');
        }
        if (mediaDataSource.hasOwnProperty('segments')) {
            throw new InvalidArgumentException(`NativePlayer(${mediaDataSource.type}) doesn't support multipart playback!`);
        }

        this.e = {};
        this.e.onvLoadedMetadata = this._onvLoadedMetadata.bind(this);

        this._pendingSeekTime = null;
        this._statisticsReporter = null;

        this._mediaDataSource = mediaDataSource;
        this._mediaElement = null;
    }

    destroy() {
        if (this._mediaElement) {
            this.unload();
            this.detachMediaElement();
        }
        this.e = null;
        this._mediaDataSource = null;
        this._emitter.removeAllListeners();
        this._emitter = null;
    }

    on(event, listener) {
        if (event === 'media_info') {
            if (this._mediaElement != null && this._mediaElement.readyState !== 0) {  // HAVE_NOTHING
                Promise.resolve().then(() => {
                    this._emitter.emit('media_info', this.mediaInfo);
                });
            }
        } else if (event === 'statistics_info') {
            if (this._mediaElement != null && this._mediaElement.readyState !== 0) {
                Promise.resolve().then(() => {
                    this._emitter.emit('statistics_info', this.statisticsInfo);
                });
            }
        }
        this._emitter.addListener(event, listener);
    }

    off(event, listener) {
        this._emitter.removeListener(event, listener);
    }

    attachMediaElement(mediaElement) {
        this._mediaElement = mediaElement;
        mediaElement.addEventListener('loadedmetadata', this.e.onvLoadedMetadata);

        if (this._pendingSeekTime != null) {
            mediaElement.currentTime = this._pendingSeekTime;
            this._pendingSeekTime = null;
        }
    }

    detachMediaElement() {
        if (this._mediaElement) {
            this._mediaElement.src = '';
            this._mediaElement.removeEventListener('loadedmetadata', this.e.onvLoadedMetadata);
            this._mediaElement = null;
        }
    }

    load() {
        if (!this._mediaElement) {
            throw new IllegalStateException('HTMLMediaElement must be attached before load()!');
        }
        this._mediaElement.src = this._mediaDataSource.url;
        this._mediaElement.preload = 'auto';
        this._mediaElement.load();
        this._statisticsReporter = window.setInterval(
            this._reportStatisticsInfo.bind(this),
        1000);
    }

    unload() {
        if (this._mediaElement) {
            this._mediaElement.src = '';
        }
        if (this._statisticsReporter != null) {
            window.clearInterval(this._statisticsReporter);
            this._statisticsReporter = null;
        }
    }

    play() {
        this._mediaElement.play();
    }

    pause() {
        this._mediaElement.pause();
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
            this._mediaElement.currentTime = seconds;
        } else {
            this._pendingSeekTime = seconds;
        }
    }

    get mediaInfo() {
        let info = {
            mimeType: 'video/' + this._mediaDataSource.type
        };
        if (this._mediaElement) {
            info.duration = Math.floor(this._mediaElement.duration * 1000);
            info.width = this._mediaElement.videoWidth;
            info.height = this._mediaElement.videoHeight;
        }
        return info;
    }

    get statisticsInfo() {
        let info = {
            playerType: this._type,
            url: this._mediaDataSource.url
        };

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
            info.decodedFrames = decoded;
            info.droppedFrames = dropped;
        }
        
        return info;
    }

    _onvLoadedMetadata(e) {
        this._emitter.emit('media_info', this.mediaInfo);
    }

    _reportStatisticsInfo() {
        this._emitter.emit('statistics_info', this.statisticsInfo);
    }

}

export default NativePlayer;