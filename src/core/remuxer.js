import EventEmitter from 'events';
import Log from '../utils/logger.js';
import LoggingControl from '../utils/logging-control.js';
import {RemuxingController, RemuxingEvents} from './remuxing-controller.js';
import RemuxingWorker from './remuxing-worker.js';
import MediaInfo from './media-info.js';

class Remuxer {

    constructor(enableWorker, url) {
        this.TAG = this.constructor.name;
        this._emitter = new EventEmitter();

        if (enableWorker && typeof (Worker) !== 'undefined') {
            try {
                let work = require('webworkify');
                this._worker = work(RemuxingWorker);
                this._workerDestroying = false;
                this._worker.addEventListener('message', this._onWorkerMessage.bind(this));
                this._worker.postMessage({cmd: 'init', param: url});
                this.e = {
                    onLoggingConfigChanged: this._onLoggingConfigChanged.bind(this)
                };
                LoggingControl.registerListener(this.e.onLoggingConfigChanged);
                this._worker.postMessage({cmd: 'logging_config', param: LoggingControl.getConfig()});
            } catch (error) {
                Log.e(this.TAG, 'Error while initialize remuxing worker, fallback to inline remuxing');
                this._controller = new RemuxingController(url);
            }
        } else {
            this._controller = new RemuxingController(url);
        }

        if (this._controller) {
            let ctl = this._controller;
            ctl.on(RemuxingEvents.IO_ERROR, this._onIOError.bind(this));
            ctl.on(RemuxingEvents.DEMUX_ERROR, this._onDemuxError.bind(this));
            ctl.on(RemuxingEvents.INIT_SEGMENT, this._onInitSegment.bind(this));
            ctl.on(RemuxingEvents.MEDIA_SEGMENT, this._onMediaSegment.bind(this));
            ctl.on(RemuxingEvents.MEDIA_INFO, this._onMediaInfo.bind(this));
            ctl.on(RemuxingEvents.RECOMMEND_SEEKPOINT, this._onRecommendSeekpoint.bind(this));
        }
    }

    destroy() {
        if (this._worker) {
            if (!this._workerDestroying) {
                this._workerDestroying = true;
                this._worker.postMessage({cmd: 'destroy'});
                LoggingControl.removeListener(this.e.onLoggingConfigChanged);
                this.e = null;
            }
        } else {
            this._controller.destroy();
            this._controller = null;
        }
        this._emitter.removeAllListeners();
        this._emitter = null;
    }

    on(event, listener) {
        this._emitter.addListener(event, listener);
    }

    off(event, listener) {
        this._emitter.removeListener(event, listener);
    }

    hasWorker() {
        return this._worker != null;
    }

    open() {  // TODO: pass url during constructing or open()?
        if (this._worker) {
            this._worker.postMessage({cmd: 'start'});
        } else {
            this._controller.start();
        }
    }

    close() {
        if (this._worker) {
            this._worker.postMessage({cmd: 'stop'});
        } else {
            this._controller.stop();
        }
    }

    seek(milliseconds) {
        if (this._worker) {
            this._worker.postMessage({cmd: 'seek', param: milliseconds});
        } else {
            this._controller.seek(milliseconds);
        }
    }

    pause() {
        if (this._worker) {
            this._worker.postMessage({cmd: 'pause'});
        } else {
            this._controller.pause();
        }
    }

    resume() {
        if (this._worker) {
            this._worker.postMessage({cmd: 'resume'});
        } else {
            this._controller.resume();
        }
    }

    syncPlayback(seconds) {
        if (this._worker) {
            this._worker.postMessage({cmd: 'sync_playback', param: seconds});
        } else {
            this._controller.syncPlayback(seconds);
        }
    }

    _onInitSegment(type, initSegment) {
        new Promise(resolve => resolve()).then(() => {
            this._emitter.emit(RemuxingEvents.INIT_SEGMENT, type, initSegment);
        });
    }

    _onMediaSegment(type, mediaSegment) {
        new Promise(resolve => resolve()).then(() => {
            this._emitter.emit(RemuxingEvents.MEDIA_SEGMENT, type, mediaSegment);
        });
    }

    _onMediaInfo(mediaInfo) {
        new Promise(resolve => resolve()).then(() => {
            this._emitter.emit(RemuxingEvents.MEDIA_INFO, mediaInfo);
        });
    }

    _onIOError(type, info) {
        new Promise(resolve => resolve()).then(() => {
            this._emitter.emit(RemuxingEvents.IO_ERROR, type, info);
        });
    }

    _onDemuxError(type, info) {
        new Promise(resolve => resolve()).then(() => {
            this._emitter.emit(RemuxingEvents.DEMUX_ERROR, type, info);
        });
    }

    _onRecommendSeekpoint(milliseconds) {
        Log.v(this.TAG, 'onRecommendSeekpoint');
        new Promise(resolve => resolve()).then(() => {
            this._emitter.emit(RemuxingEvents.RECOMMEND_SEEKPOINT, milliseconds);
        });
    }

    _onLoggingConfigChanged(config) {
        if (this._worker) {
            this._worker.postMessage({cmd: 'logging_config', param: config});
        }
    }

    _onWorkerMessage(e) {
        let message = e.data;
        let data = message.data;
        Log.v(this.TAG, 'onWorkerMessage: ' + message.msg);
        switch (message.msg) {
            case 'destroyed':
                this._workerDestroying = false;
                this._worker.terminate();
                this._worker = null;
                break;
            case RemuxingEvents.INIT_SEGMENT:
            case RemuxingEvents.MEDIA_SEGMENT:
                this._emitter.emit(message.msg, data.type, data.data);
                break;
            case RemuxingEvents.MEDIA_INFO:
                Object.setPrototypeOf(data, MediaInfo.prototype);
                this._emitter.emit(message.msg, data);
                break;
            case RemuxingEvents.IO_ERROR:
            case RemuxingEvents.DEMUX_ERROR:
                this._emitter.emit(message.msg, data.type, data.info);
                break;
            case RemuxingEvents.RECOMMEND_SEEKPOINT:
                this._emitter.emit(message.msg, data);
                break;
            default:
                break;
        }
    }

}

export default Remuxer;