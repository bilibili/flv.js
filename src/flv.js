import Polyfill from './utils/polyfill.js';
import Features from './core/features.js';
import FlvPlayer from './player/flv-player.js';
import NativePlayer from './player/native-player.js';
import LoggingControl from './utils/logging-control.js';

// entry/index file

// install polyfills
Polyfill.install();


// factory method
function createPlayer(mediaDataSource) {
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


// feature detection
function isSupported() {
    return Features.supportMSEH264Playback();
}

function getFeatureList() {
    let features = {
        mseFlvPlayback: false,
        mseLiveFlvPlayback: false,
        networkStreamIO: false,
        networkLoaderName: '',
        nativeMP4H264Playback: false,
        nativeWebmVP8Playback: false,
        nativeWebmVP9Playback: false
    };

    features.mseFlvPlayback = Features.supportMSEH264Playback();
    features.networkStreamIO = Features.supportNetworkStreamIO();
    features.networkLoaderName = Features.getNetworkLoaderTypeName();
    features.mseLiveFlvPlayback = features.mseFlvPlayback && features.networkStreamIO;
    features.nativeMP4H264Playback = Features.supportNativeMediaPlayback('video/mp4; codecs="avc1.42001E, mp4a.40.2"');
    features.nativeWebmVP8Playback = Features.supportNativeMediaPlayback('video/webm; codecs="vp8.0, vorbis"');
    features.nativeWebmVP9Playback = Features.supportNativeMediaPlayback('video/webm; codecs="vp9"');

    return features;
}


// interfaces
let flvjs = {};

flvjs.createPlayer = createPlayer;
flvjs.isSupported = isSupported;
flvjs.getFeatureList = getFeatureList;

flvjs.FlvPlayer = FlvPlayer;
flvjs.NativePlayer = NativePlayer;
flvjs.LoggingControl = LoggingControl;


// export interfaces to global context
window.flvjs = flvjs;
export default flvjs;