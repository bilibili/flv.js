/*
 * Copyright (C) 2017 zheng qian <xqq@xqq.im>
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

import Log from './logger.js';

let TAG = 'FlashBridge';

class FlashBridge {

    static _onSwfLoaded() {
        this._swfLoaded = true;
        this._swf = document.getElementById('flashstreamloader');
        Log.v(TAG, 'swf loading complete');
    }

    static _onOpen(handle) {
        if (this._callbackTable[handle] != undefined) {
            let listener = this._callbackTable[handle][this.OPEN];
            if (listener != undefined) {
                listener();
            }
        }
    }

    static _onComplete(handle) {
        if (this._callbackTable[handle] != undefined) {
            let listener = this._callbackTable[handle][this.COMPLETE];
            if (listener != undefined) {
                listener();
            }
        }
    }

    static _onDataArrival(handle, data, id) {
        if (this._callbackTable[handle] != undefined) {
            let listener = this._callbackTable[handle][this.DATA_ARRIVAL];
            if (listener != undefined) {
                listener(data, id);
            }
        }
    }

    static _onError(handle, code, description) {
        if (this._callbackTable[handle] != undefined) {
            let listener = this._callbackTable[handle][this.ERROR];
            if (listener != undefined) {
                listener(code, description);
            }
        }
    }

    static create() {
        let loaderHandle = this._swf.create();
        return loaderHandle;
    }

    static destroy(handle) {
        this._callbackTable[handle] = undefined;
        this._swf.destroy(handle);
    }

    static open(handle, url, rangeStart) {
        this._swf.open(handle, url, rangeStart);
    }

    static abort(handle) {
        this._swf.abort(handle);
    }

    static setEventListener(handle, event, listener) {
        if (this._callbackTable[handle] == undefined) {
            this._callbackTable[handle] = {};
        }
        this._callbackTable[handle][event] = listener;
    }

    static unsetEventListener(handle, event) {
        if (this._callbackTable[handle] == undefined) {
            return;
        }
        this._callbackTable[handle][event] = undefined;
    }

}

FlashBridge.OPEN = 'open';
FlashBridge.COMPLETE = 'complete';
FlashBridge.DATA_ARRIVAL = 'data_arrival';
FlashBridge.ERROR = 'error';

FlashBridge._swf = null;
FlashBridge._swfLoaded = false;
FlashBridge._callbackTable = [undefined];


export function InjectFlashBridge() {
    window.__flvjs_flashBridge = FlashBridge;
}