import BasePlayer from './base-player.js';

// Player wrapper for browser's native player (HTMLVideoElement) without MediaSource src. 
class NativePlayer extends BasePlayer {

    constructor(mediaDataSource) {
        super('NativePlayer');

        if (mediaDataSource.hasOwnProperty('segments')) {
            throw `NativePlayer(${mediaDataSource.type}) doesn't support multipart playback!`;
        }
        this._mediaDataSource = mediaDataSource;
    }

    destroy() {
        super.destroy();
    }

}

export default NativePlayer;