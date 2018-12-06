/*
 * Copyright (C) 2016 Bilibili. All Rights Reserved.
 *
 * @author zheng qian <xqq@xqq.im>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import EventEmitter from 'events';
import Log from '../utils/logger.js';
import LoggingControl from '../utils/logging-control.js';
import TransmuxingController from './transmuxing-controller.js';
import TransmuxingEvents from './transmuxing-events.js';
import TransmuxingWorker from './transmuxing-worker.js';
import MediaInfo from './media-info.js';

class Transmuxer {

    constructor(mediaDataSource, config) {
        this.TAG = 'Transmuxer';
        this._emitter = new EventEmitter();

        if (config.enableWorker && typeof (Worker) !== 'undefined') {
            try {
                let work = require('webworkify');
                this._worker = work(TransmuxingWorker);
                this._workerDestroying = false;
                this._worker.addEventListener('message', this._onWorkerMessage.bind(this));
                this._worker.postMessage({cmd: 'init', param: [mediaDataSource, config]});
                this.e = {
                    onLoggingConfigChanged: this._onLoggingConfigChanged.bind(this)
                };
                LoggingControl.registerListener(this.e.onLoggingConfigChanged);
                this._worker.postMessage({cmd: 'logging_config', param: LoggingControl.getConfig()});
            } catch (error) {
                Log.e(this.TAG, 'Error while initialize transmuxing worker, fallback to inline transmuxing');
                this._worker = null;
                this._controller = new TransmuxingController(mediaDataSource, config);
            }
        } else {
            this._controller = new TransmuxingController(mediaDataSource, config);
        }

        if (this._controller) {
            let ctl = this._controller;
            ctl.on(TransmuxingEvents.IO_ERROR, this._onIOError.bind(this));
            ctl.on(TransmuxingEvents.DEMUX_ERROR, this._onDemuxError.bind(this));
            ctl.on(TransmuxingEvents.INIT_SEGMENT, this._onInitSegment.bind(this));
            ctl.on(TransmuxingEvents.MEDIA_SEGMENT, this._onMediaSegment.bind(this));
            ctl.on(TransmuxingEvents.LOADING_COMPLETE, this._onLoadingComplete.bind(this));
            ctl.on(TransmuxingEvents.RECOVERED_EARLY_EOF, this._onRecoveredEarlyEof.bind(this));
            ctl.on(TransmuxingEvents.MEDIA_INFO, this._onMediaInfo.bind(this));
            ctl.on(TransmuxingEvents.METADATA_ARRIVED, this._onMetaDataArrived.bind(this));
            ctl.on(TransmuxingEvents.SCRIPTDATA_ARRIVED, this._onScriptDataArrived.bind(this));
            ctl.on(TransmuxingEvents.STATISTICS_INFO, this._onStatisticsInfo.bind(this));
            ctl.on(TransmuxingEvents.RECOMMEND_SEEKPOINT, this._onRecommendSeekpoint.bind(this));
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

    open() {
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

    _onInitSegment(type, initSegment) {
        // do async invoke
        Promise.resolve().then(() => {
            this._emitter.emit(TransmuxingEvents.INIT_SEGMENT, type, initSegment);
        });
    }

    _onMediaSegment(type, mediaSegment) {
        Promise.resolve().then(() => {
            this._emitter.emit(TransmuxingEvents.MEDIA_SEGMENT, type, mediaSegment);
        });
    }

    _onLoadingComplete() {
        Promise.resolve().then(() => {
            this._emitter.emit(TransmuxingEvents.LOADING_COMPLETE);
        });
    }

    _onRecoveredEarlyEof() {
        Promise.resolve().then(() => {
            this._emitter.emit(TransmuxingEvents.RECOVERED_EARLY_EOF);
        });
    }

    _onMediaInfo(mediaInfo) {
        Promise.resolve().then(() => {
            this._emitter.emit(TransmuxingEvents.MEDIA_INFO, mediaInfo);
        });
    }

    _onMetaDataArrived(metadata) {
        Promise.resolve().then(() => {
            this._emitter.emit(TransmuxingEvents.METADATA_ARRIVED, metadata);
        });
    }

    _onScriptDataArrived(data) {
        Promise.resolve().then(() => {
            this._emitter.emit(TransmuxingEvents.SCRIPTDATA_ARRIVED, data);
        });
    }

    _onStatisticsInfo(statisticsInfo) {
        Promise.resolve().then(() => {
            this._emitter.emit(TransmuxingEvents.STATISTICS_INFO, statisticsInfo);
        });
    }

    _onIOError(type, info) {
        Promise.resolve().then(() => {
            this._emitter.emit(TransmuxingEvents.IO_ERROR, type, info);
        });
    }

    _onDemuxError(type, info) {
        Promise.resolve().then(() => {
            this._emitter.emit(TransmuxingEvents.DEMUX_ERROR, type, info);
        });
    }

    _onRecommendSeekpoint(milliseconds) {
        Promise.resolve().then(() => {
            this._emitter.emit(TransmuxingEvents.RECOMMEND_SEEKPOINT, milliseconds);
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

        if (message.msg === 'destroyed' || this._workerDestroying) {
            this._workerDestroying = false;
            this._worker.terminate();
            this._worker = null;
            return;
        }

        switch (message.msg) {
            case TransmuxingEvents.INIT_SEGMENT:
            case TransmuxingEvents.MEDIA_SEGMENT:
                this._emitter.emit(message.msg, data.type, data.data);
                break;
            case TransmuxingEvents.LOADING_COMPLETE:
            case TransmuxingEvents.RECOVERED_EARLY_EOF:
                this._emitter.emit(message.msg);
                break;
            case TransmuxingEvents.MEDIA_INFO:
                Object.setPrototypeOf(data, MediaInfo.prototype);
                this._emitter.emit(message.msg, data);
                break;
            case TransmuxingEvents.METADATA_ARRIVED:
            case TransmuxingEvents.SCRIPTDATA_ARRIVED:
            case TransmuxingEvents.STATISTICS_INFO:
                this._emitter.emit(message.msg, data);
                break;
            case TransmuxingEvents.IO_ERROR:
            case TransmuxingEvents.DEMUX_ERROR:
                this._emitter.emit(message.msg, data.type, data.info);
                break;
            case TransmuxingEvents.RECOMMEND_SEEKPOINT:
                this._emitter.emit(message.msg, data);
                break;
            case 'logcat_callback':
                Log.emitter.emit('log', data.type, data.logcat);
                break;
            default:
                break;
        }
    }

}

export default Transmuxer;