import Log from '../utils/logger.js';
import BasePlayer from './base-player.js';
import Remuxer from '../core/remuxer.js';
import MSEController from '../core/mse-controller.js';

class FlvPlayer extends BasePlayer {

    constructor(mediaDataSource) {
        super('FlvPlayer');
        this.TAG = this.constructor.name;

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
    }

    destroy() {
        this._mediaDataSource = null;
        this._mediaElement = null;
        this._remuxer.destroy();
        this._remuxer = null;
        this._msectl.destroy();
        this._msectl = null;
        super.destroy();
    }

    attachMediaElement(mediaElement) {
        this._mediaElement = mediaElement;
        this._msectl.attachMediaElement(mediaElement);
    }

    detachMediaElement() {
        if (this._mediaElement) {
            this._msectl.detachMediaElement();
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

}

export default FlvPlayer;