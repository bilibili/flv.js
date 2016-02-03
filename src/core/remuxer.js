import RemuxingController from './remuxing-controller.js';
import RemuxingWorker from './remuxing-worker.js';

class Remuxer {

    constructor(enableWorker) {
        if (enableWorker && typeof (Worker) !== 'undefined') {
            try {
                let work = require('webworkify');
                this._worker = work(RemuxingWorker);
                this._worker.addEventListener('message', this._onWorkerMessage.bind(this));
                this._worker.postMessage({cmd: 'init'}); // init
            } catch (error) {
                console.error('Error while initialize remuxing worker, fallback to inline remuxing');
                this._controller = new RemuxingController();
            }
        } else {
            this._controller = new RemuxingController();
        }
    }

    seek(milliseconds, bytesPosition) {
        // send message to worker
        // or control the RemuxerController
        if (this._worker) {
            this._worker.postMessage({cmd: 'seek', param: bytesPosition});
            console.log('worker message sent');
        }
    }

    _onWorkerMessage(e) {
        switch (e.data.event) {
            case 'onMetadata':
                console.log('received worker message: onMetadata');
                break;
            default:
                break;
        }
    }

}

export default Remuxer;