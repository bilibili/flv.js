import Polyfill from './utils/polyfill.js';
import Features from './core/features.js';
import FlvPlayer from './player/flv-player.js';
import NativePlayer from './player/native-player.js';
import PlayerEvents from './player/player-events.js';
import {ErrorTypes, ErrorDetails} from './player/player-errors.js';
import LoggingControl from './utils/logging-control.js';
import {InvalidArgumentException} from './utils/exception.js';

// entry/index file

// install polyfills
Polyfill.install();


// factory method
function createPlayer(mediaDataSource, optionalConfig) {
    let mds = mediaDataSource;
    if (mds == null || typeof mds !== 'object') {
        throw new InvalidArgumentException('MediaDataSource must be an javascript object!');
    }

    if (!mds.hasOwnProperty('type')) {
        throw new InvalidArgumentException('MediaDataSource must has type field to indicate video file type!');
    }

    switch (mds.type) {
        case 'flv':
            return new FlvPlayer(mds, optionalConfig);
        default:
            return new NativePlayer(mds, optionalConfig);
    }
}


// feature detection
function isSupported() {
    return Features.supportMSEH264Playback();
}

function getFeatureList() {
    return Features.getFeatureList();
}


// interfaces
let flvjs = {};

flvjs.createPlayer = createPlayer;
flvjs.isSupported = isSupported;
flvjs.getFeatureList = getFeatureList;

flvjs.Events = PlayerEvents;
flvjs.ErrorTypes = ErrorTypes;
flvjs.ErrorDetails = ErrorDetails;

flvjs.FlvPlayer = FlvPlayer;
flvjs.NativePlayer = NativePlayer;
flvjs.LoggingControl = LoggingControl;


// export interfaces to global context
window.flvjs = flvjs;
export default flvjs;