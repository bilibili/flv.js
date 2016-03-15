import EventEmitter from 'events';
import Log from '../utils/logger.js';
import {RemuxingController, RemuxingEvents} from './remuxing-controller.js';
import RemuxingWorker from './remuxing-worker.js';

class Remuxer extends EventEmitter {

    constructor(enableWorker, url) {
        super();

        this.TAG = this.constructor.name;

        if (enableWorker && typeof (Worker) !== 'undefined') {
            try {
                let work = require('webworkify');
                this._worker = work(RemuxingWorker);
                this._workerDestroying = false;
                this._worker.addEventListener('message', this._onWorkerMessage.bind(this));
                this._worker.postMessage({cmd: 'init', param: url}); // init
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
        }
    }

    destroy() {
        if (this._worker) {
            if (!this._workerDestroying) {
                this._workerDestroying = true;
                this._worker.postMessage({cmd: 'destroy'});
            }
        } else {
            this._controller.destroy();
            this._controller = null;
        }
        this.removeAllListeners();
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
        Log.v(this.TAG, 'onInitSegment');
        this.emit(RemuxingEvents.INIT_SEGMENT, type, initSegment);
    }

    _onMediaSegment(type, mediaSegment) {
        Log.v(this.TAG, 'onMediaSegment');
        this.emit(RemuxingEvents.MEDIA_SEGMENT, type, mediaSegment);
    }

    _onIOError(type, info) {
        Log.v(this.TAG, 'onIOError');
        this.emit(RemuxingEvents.IO_ERROR, type, info);
    }

    _onDemuxError(type, info) {
        Log.v(this.TAG, 'onDemuxError');
        this.emit(RemuxingEvents.DEMUX_ERROR, type, info);
    }

    _onWorkerMessage(e) {
        let message = e.data;
        let data = message.data;

        switch (message.msg) {
            case 'destroyed':
                this._workerDestroying = false;
                this._worker.terminate();
                this._worker = null;
                break;
            case RemuxingEvents.INIT_SEGMENT:
                this._onInitSegment(data.type, data.initSegment);
                break;
            case RemuxingEvents.MEDIA_SEGMENT:
                this._onMediaSegment(data.type, data.mediaSegment);
                break;
            case RemuxingEvents.IO_ERROR:
                this._onIOError(data.type, data.info);
                break;
            case RemuxingEvents.DEMUX_ERROR:
                this._onDemuxError(data.type, data.info);
                break;
            default:
                break;
        }
    }

}

export default Remuxer;