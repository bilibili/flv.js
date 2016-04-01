import Log from '../utils/logger.js';
import LoggingControl from '../utils/logging-control.js';
import {RemuxingController, RemuxingEvents} from './remuxing-controller.js';

/* post message to worker:
   data: {
       cmd: string
       param: any
   }

   post message from worker inside:
   data: {
       msg: string,
       data: any
   }
 */

let RemuxingWorker = function (self) {

    let TAG = 'RemuxingWorker';
    let controller = null;

    self.addEventListener('message', function (e) {
        Log.v(TAG, 'worker onmessage: ' + e.data.cmd);
        switch (e.data.cmd) {
            case 'init':
                controller = new RemuxingController(e.data.param);
                controller.on(RemuxingEvents.IO_ERROR, onIOError.bind(this));
                controller.on(RemuxingEvents.DEMUX_ERROR, onDemuxError.bind(this));
                controller.on(RemuxingEvents.INIT_SEGMENT, onInitSegment.bind(this));
                controller.on(RemuxingEvents.MEDIA_SEGMENT, onMediaSegment.bind(this));
                controller.on(RemuxingEvents.RECOMMEND_SEEKPOINT, onRecommendSeekpoint.bind(this));
                break;
            case 'destroy':
                if (controller) {
                    controller.destroy();
                    controller = null;
                }
                self.postMessage({msg: 'destroyed'});
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
            case 'logging_config':
                LoggingControl.applyConfig(e.data.param);
                break;
        }
    });

    function onInitSegment(type, initSegment) {
        let obj = {
            msg: RemuxingEvents.INIT_SEGMENT,
            data: {
                type: type,
                data: initSegment
            }
        };
        self.postMessage(obj, [initSegment.data]);  // data: ArrayBuffer
    }

    function onMediaSegment(type, mediaSegment) {
        let obj = {
            msg: RemuxingEvents.MEDIA_SEGMENT,
            data: {
                type: type,
                data: mediaSegment
            }
        };
        self.postMessage(obj, [mediaSegment.data]);  // data: ArrayBuffer
    }

    function onIOError(type, info) {
        self.postMessage({
            msg: RemuxingEvents.IO_ERROR,
            data: {
                type: type,
                info: info
            }
        });
    }

    function onDemuxError(type, info) {
        self.postMessage({
            msg: RemuxingEvents.DEMUX_ERROR,
            data: {
                type: type,
                info: info
            }
        });
    }

    function onRecommendSeekpoint(milliseconds) {
        self.postMessage({
            msg: RemuxingEvents.RECOMMEND_SEEKPOINT,
            data: milliseconds
        });
    }

};

export default RemuxingWorker;