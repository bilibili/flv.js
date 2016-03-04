import Log from '../utils/logger.js';
import RemuxingController from './remuxing-controller.js';

let RemuxingWorker = function (self) {

    let TAG = 'RemuxingWorker';
    let controller = null;

    self.addEventListener('message', function (e) {
        Log.v(TAG, 'worker onmessage: ' + e.data.cmd);
        switch (e.data.cmd) {
            case 'init':
                controller = new RemuxingController(e.data.param);
                break;
            case 'destroy':
                if (controller) {
                    controller.destroy();
                    controller = null;
                }
                break;
            case 'start':
                controller.start();
                break;
            case 'stop':
                controller.stop();
                break;
            case 'seek':
                controller.seek(e.data.param);
                break;
        }
    });

};

export default RemuxingWorker;