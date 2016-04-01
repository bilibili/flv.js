import Log from '../utils/logger.js';
import BasePlayer from './base-player.js';
import Remuxer from '../core/remuxer.js';
import MSEController from '../core/mse-controller.js';

class FlvPlayer extends BasePlayer {

    constructor(mediaDataSource) {
        super('FlvPlayer');
        this.TAG = this.constructor.name;

        this.e = {};
        this.e.onvSeeking = this._onvSeeking.bind(this);
        this.e.onvSeeked = this._onvSeeked.bind(this);

        this._requestSetTime = false;
        this._seekpointRecord = null;

        this._mediaDataSource = mediaDataSource;
        this._mediaElement = null;
        this._msectl = new MSEController();

        this._remuxer = new Remuxer(false, this._mediaDataSource.url);  // TODO
        this._remuxer.on('init_segment', (type, is) => {
            this._msectl.appendInitSegment(is);
        });
        this._remuxer.on('media_segment', (type, ms) => {
            this._msectl.appendMediaSegment(ms);
        });
        this._remuxer.on('recommend_seekpoint', (milliseconds) => {
            Log.v(this.TAG, 'Recommended seekpoint: ' + milliseconds);
            if (this._mediaElement) {
                this._requestSetTime = true;
                this._mediaElement.currentTime = milliseconds / 1000;
            }
        });
    }

    destroy() {
        if (this._mediaElement) {
            this.detachMediaElement();
        }
        this.e = null;
        this._mediaDataSource = null;
        this._remuxer.destroy();
        this._remuxer = null;
        this._msectl.destroy();
        this._msectl = null;
        super.destroy();
    }

    attachMediaElement(mediaElement) {
        this._mediaElement = mediaElement;
        this._msectl.attachMediaElement(mediaElement);
        mediaElement.addEventListener('seeking', this.e.onvSeeking);
        mediaElement.addEventListener('seeked', this.e.onvSeeked);
    }

    detachMediaElement() {
        if (this._mediaElement) {
            this._msectl.detachMediaElement();
            this._mediaElement.removeEventListener('seeking', this.e.onvSeeking);
            this._mediaElement.removeEventListener('seeked', this.e.onvSeeked);
            this._mediaElement = null;
        }
    }

    prepare() {
        if (!this._mediaElement) {
            throw 'HTMLMediaElement must be attached before prepare()!';
        }
        this._remuxer.open();
    }

    start() {
        this._mediaElement.play();
    }

    pause() {
        this._mediaElement.pause();
    }

    seekTo(seconds) {
        Log.v(this.TAG, 'Received seekTo request');
        this._internalSeek(seconds, false);
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
        Log.v(this.TAG, 'internalSeek');
        let directSeek = this._isTimepointBuffered(seconds);

        if (directSeek) {  // buffered position
            this._requestSetTime = true;
            this._mediaElement.currentTime = seconds;
        } else {
            this._remuxer.seek(Math.floor(seconds * 1000));  // in milliseconds
            // no need to set mediaElement.currentTime,
            // just wait for the recommend_seekpoint callback
        }
    }

    _checkAndApplyUnbufferedSeekpoint() {
        if (this._seekpointRecord) {
            if (this._seekpointRecord.recordTime <= self.performance.now() - 250) {
                let target = this._mediaElement.currentTime;
                this._seekpointRecord = null;
                if (!this._isTimepointBuffered(target)) {
                    this._remuxer.seek(Math.floor(target * 1000));
                }
            } else {
                window.setTimeout(this._checkAndApplyUnbufferedSeekpoint.bind(this), 50);
            }
        }
    }

    _onvSeeking(e) {  // handle seeking request from browser's progress bar
        Log.v(this.TAG, 'onvSeeking');
        if (this._requestSetTime) {
            this._requestSetTime = false;
            return;
        }
        if (this._isTimepointBuffered(this._mediaElement.currentTime)) {
            return;
        }

        this._seekpointRecord = {
            seekPoint: this._mediaElement.currentTime,
            recordTime: self.performance.now()
        };
        window.setTimeout(this._checkAndApplyUnbufferedSeekpoint.bind(this), 50);
    }

    _onvSeeked(e) {
        Log.v(this.TAG, 'onvSeeked');
    }

}

export default FlvPlayer;