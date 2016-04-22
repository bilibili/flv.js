import PlayerFactory from './player/player-factory.js';
import FlvPlayer from './player/flv-player.js';
import NativePlayer from './player/native-player.js';
import LoggingControl from './utils/logging-control.js';
import Polyfill from './utils/polyfill.js';

// entry/index file

// install polyfills
Polyfill.install();

// interfaces
let flvjs = {};
flvjs.PlayerFactory = PlayerFactory;
flvjs.FlvPlayer = FlvPlayer;
flvjs.NativePlayer = NativePlayer;
flvjs.LoggingControl = LoggingControl;

// export interfaces to global context
window.flvjs = flvjs;
export default flvjs;