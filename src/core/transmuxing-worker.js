import Log from '../utils/logger.js';
import LoggingControl from '../utils/logging-control.js';
import Polyfill from '../utils/polyfill.js';
import {TransmuxingController, TransmuxingEvents} from './transmuxing-controller.js';

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

let TransmuxingWorker = function (self) {

    let TAG = 'TransmuxingWorker';
    let controller = null;

    Polyfill.install();

    self.addEventListener('message', function (e) {
        switch (e.data.cmd) {
            case 'init':
                controller = new TransmuxingController(e.data.param);
                controller.on(TransmuxingEvents.IO_ERROR, onIOError.bind(this));
                controller.on(TransmuxingEvents.DEMUX_ERROR, onDemuxError.bind(this));
                controller.on(TransmuxingEvents.INIT_SEGMENT, onInitSegment.bind(this));
                controller.on(TransmuxingEvents.MEDIA_SEGMENT, onMediaSegment.bind(this));
                controller.on(TransmuxingEvents.MEDIA_INFO, onMediaInfo.bind(this));
                controller.on(TransmuxingEvents.STATISTICS_INFO, onStatisticsInfo.bind(this));
                controller.on(TransmuxingEvents.RECOMMEND_SEEKPOINT, onRecommendSeekpoint.bind(this));
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
            case 'pause':
                controller.pause();
                break;
            case 'resume':
                controller.resume();
                break;
            case 'logging_config':
                LoggingControl.applyConfig(e.data.param);
                break;
        }
    });

    function onInitSegment(type, initSegment) {
        let obj = {
            msg: TransmuxingEvents.INIT_SEGMENT,
            data: {
                type: type,
                data: initSegment
            }
        };
        self.postMessage(obj, [initSegment.data]);  // data: ArrayBuffer
    }

    function onMediaSegment(type, mediaSegment) {
        let obj = {
            msg: TransmuxingEvents.MEDIA_SEGMENT,
            data: {
                type: type,
                data: mediaSegment
            }
        };
        self.postMessage(obj, [mediaSegment.data]);  // data: ArrayBuffer
    }

    function onMediaInfo(mediaInfo) {
        let obj = {
            msg: TransmuxingEvents.MEDIA_INFO,
            data: mediaInfo
        };
        self.postMessage(obj);
    }

    function onStatisticsInfo(statInfo) {
        let obj = {
            msg: TransmuxingEvents.STATISTICS_INFO,
            data: statInfo
        };
        self.postMessage(obj);
    }

    function onIOError(type, info) {
        self.postMessage({
            msg: TransmuxingEvents.IO_ERROR,
            data: {
                type: type,
                info: info
            }
        });
    }

    function onDemuxError(type, info) {
        self.postMessage({
            msg: TransmuxingEvents.DEMUX_ERROR,
            data: {
                type: type,
                info: info
            }
        });
    }

    function onRecommendSeekpoint(milliseconds) {
        self.postMessage({
            msg: TransmuxingEvents.RECOMMEND_SEEKPOINT,
            data: milliseconds
        });
    }

};

export default TransmuxingWorker;