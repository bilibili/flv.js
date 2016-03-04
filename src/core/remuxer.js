import Log from '../utils/logger.js';
import RemuxingController from './remuxing-controller.js';
import RemuxingWorker from './remuxing-worker.js';

class Remuxer {

    constructor(enableWorker, url) {
        this.TAG = this.constructor.name;
        if (enableWorker && typeof (Worker) !== 'undefined') {
            try {
                let work = require('webworkify');
                this._worker = work(RemuxingWorker);
                this._worker.addEventListener('message', this._onWorkerMessage.bind(this));
                this._worker.postMessage({cmd: 'init', param: url}); // init
            } catch (error) {
                Log.e(this.TAG, 'Error while initialize remuxing worker, fallback to inline remuxing');
                this._controller = new RemuxingController(url);
            }
        } else {
            this._controller = new RemuxingController(url);
        }
    }

    destroy() {
        // TODO: this._worker.removeEventListener...
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

    _onWorkerMessage(e) {
        switch (e.data.event) {
            case 'onMetadata':
                Log.d(this.TAG, 'received worker message: onMetadata');
                break;
            default:
                break;
        }
    }

}

export default Remuxer;