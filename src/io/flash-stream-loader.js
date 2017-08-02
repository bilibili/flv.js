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

import Log from '../utils/logger.js';
import {BaseLoader, LoaderStatus, LoaderErrors} from './loader.js';
import {RuntimeException} from '../utils/exception.js';

// Global context of the flash stream loader
let context = self.__flvjs_flashBridge;

// A stream loader which pulls data through Flash plugin
class FlashStreamLoader extends BaseLoader {

    static isSupported() {
        context = self.__flvjs_flashBridge;
        return (self === window) && (context != undefined) && (context._swfLoaded);
    }

    constructor() {
        super('flash-stream-loader');
        this.TAG = 'FlashStreamLoader';

        this._needStash = true;
        this._handle = null;
        this._aborted = false;
        this._receivedLength = 0;
    }

    destroy() {
        if (this._handle != null) {
            context.destroy(this._handle);
            this._handle = null;
        }
        super.destroy();
    }

    open(dataSource, range) {
        this._range = range;

        let handle = this._handle = context.create();
        context.setEventListener(handle, context.OPEN, this._onStreamOpen.bind(this));
        context.setEventListener(handle, context.COMPLETE, this._onStreamComplete.bind(this));
        context.setEventListener(handle, context.DATA_ARRIVAL, this._onBase64Arrival.bind(this));
        context.setEventListener(handle, context.ERROR, this._onStreamError.bind(this));

        this._status = LoaderStatus.kConnecting;
        context.open(handle, dataSource.url, range.from);
    }

    abort() {
        this._aborted = true;
        this._status = LoaderStatus.kComplete;
        context.abort(this._handle);
    }

    _onStreamOpen() {
        this._status = LoaderStatus.kBuffering;
    }

    _onStreamComplete() {
        if (this._aborted === true) {
            return;
        }

        this._status = LoaderStatus.kComplete;

        if (this._onComplete) {
            this._onComplete(this._range.from, this._range.from + this._receivedLength - 1);
        }
    }

    _onBase64Arrival(base64) {
        if (this._aborted === true) {
            // Ignore data after aborted
            return;
        }

        let rawstring = atob(base64);
        let length = rawstring.length;
        let array = new Uint8Array(length);

        for (let i = 0; i < length; i++) {
            array[i] = rawstring.charCodeAt(i);
        }

        let buffer = array.buffer;
        let byteStart = this._range.from + this._receivedLength;
        this._receivedLength += buffer.byteLength;

        if (this._onDataArrival) {
            this._onDataArrival(buffer, byteStart, this._receivedLength);
        }
    }

    _onStreamError(code, description) {
        this._status = LoaderStatus.kError;

        let type = code !== -1 ? LoaderErrors.HTTP_STATUS_CODE_INVALID : LoaderErrors.EXCEPTION;

        let info = {
            code: code,
            msg: description
        };

        if (this._onError) {
            this._onError(type, info);
        } else {
            throw new RuntimeException(info.msg);
        }
    }

}

export default FlashStreamLoader;