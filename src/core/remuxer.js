import EventEmitter from 'events';
import Log from '../utils/logger.js';
import LoggingControl from '../utils/logging-control.js';
import {RemuxingController, RemuxingEvents} from './remuxing-controller.js';
import RemuxingWorker from './remuxing-worker.js';

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

    _onInitSegment(type, initSegment) {
        this._emitter.emit(RemuxingEvents.INIT_SEGMENT, type, initSegment);
    }

    _onMediaSegment(type, mediaSegment) {
        this._emitter.emit(RemuxingEvents.MEDIA_SEGMENT, type, mediaSegment);
    }

    _onIOError(type, info) {
        this._emitter.emit(RemuxingEvents.IO_ERROR, type, info);
    }

    _onDemuxError(type, info) {
        this._emitter.emit(RemuxingEvents.DEMUX_ERROR, type, info);
    }

    _onRecommendSeekpoint(milliseconds) {
        Log.v(this.TAG, 'onRecommendSeekpoint');
        this._emitter.emit(RemuxingEvents.RECOMMEND_SEEKPOINT, milliseconds);
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
                this._onInitSegment(data.type, data.data);
                break;
            case RemuxingEvents.MEDIA_SEGMENT:
                this._onMediaSegment(data.type, data.data);
                break;
            case RemuxingEvents.IO_ERROR:
                this._onIOError(data.type, data.info);
                break;
            case RemuxingEvents.DEMUX_ERROR:
                this._onDemuxError(data.type, data.info);
                break;
            case RemuxingEvents.RECOMMEND_SEEKPOINT:
                this._onRecommendSeekpoint(data);
                break;
            default:
                break;
        }
    }

}

export default Remuxer;