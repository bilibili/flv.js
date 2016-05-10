import FlvPlayer from './flv-player.js';
import NativePlayer from './native-player.js';

class PlayerFactory {

    static isSupported() {
        return (window.MediaSource && window.MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"'));
    }

    static createPlayer(mediaDataSource) {
        let mds = mediaDataSource;
        if (mds == null || typeof mds !== 'object') {
            throw 'MediaDataSource must be an javascript object!';
        }

        if (!mds.hasOwnProperty('type')) {
            throw 'MediaDataSource must has type field to indicate video file type!';
        }

        switch (mds.type) {
            case 'flv':
                return new FlvPlayer(mds);
            default:
                return new NativePlayer(mds);
        }
    }

}

// just an example
let exampleMediaDataSource = {
    type: 'flv',
    isLive: false,
    duration: 12450,  // in milliseconds
    filesize: 45120,  // in bytes
    cors: true,
    withCredentials: false,
    url: 'http://ws.acgvideo.com/23333.flv',  // provide url or segments alternatively
    segments: [       // optional
        {
            duration: 233,
            filesize: 450,
            url: 'http://ws.acgvideo.com/23333-1.flv'
        },
        {
            duration: 444,
            filesize: 580,
            url: 'http://ws.acgvideo.com/23333-2.flv'
        }
    ]
};


export default PlayerFactory;