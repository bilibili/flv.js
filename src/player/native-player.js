import BasePlayer from './base-player.js';

// Player wrapper for browser's native player (HTMLVideoElement) without MediaSource src. 
class NativePlayer extends BasePlayer {

    constructor(mediaDataSource) {
        super('NativePlayer');

        if (mediaDataSource.type.toLowerCase() === 'flv') {
            throw 'NativePlayer does\'t support flv MediaDataSource input!';
        }
        if (mediaDataSource.hasOwnProperty('segments')) {
            throw `NativePlayer(${mediaDataSource.type}) doesn't support multipart playback!`;
        }

        this._pendingSeekTime = null;

        this._mediaDataSource = mediaDataSource;
        this._mediaElement = null;
    }

    destroy() {
        super.destroy();
    }

    attachMediaElement(mediaElement) {
        this._mediaElement = mediaElement;
        if (this._pendingSeekTime != null) {
            mediaElement.currentTime = this._pendingSeekTime;
            this._pendingSeekTime = null;
        }
    }

    detachMediaElement() {
        if (this._mediaElement) {
            this._mediaElement.src = '';
            this._mediaElement = null;
        }
    }

    load() {
        if (!this._mediaElement) {
            throw 'HTMLMediaElement must be attached before load()!';
        }
        this._mediaElement.src = this._mediaDataSource.url;
        this._mediaElement.preload = 'auto';
        this._mediaElement.load();
    }

    unload() {
        if (this._mediaElement) {
            this._mediaElement.src = '';
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
}

export default NativePlayer;