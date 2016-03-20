import PlayerFactory from './player/player-factory.js';
import FlvPlayer from './player/flv-player.js';
import NativePlayer from './player/native-player.js';
import LoggingControl from './utils/logging-control.js';

// entry/index file

let flvjs = {};
flvjs.PlayerFactory = PlayerFactory;
flvjs.FlvPlayer = FlvPlayer;
flvjs.NativePlayer = NativePlayer;
flvjs.LoggingControl = LoggingControl;

// export interface to global context
window.flvjs = flvjs;
export default flvjs;