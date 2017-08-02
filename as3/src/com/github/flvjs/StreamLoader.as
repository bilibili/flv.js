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

package com.github.flvjs {

    import flash.events.Event;
    import flash.events.EventDispatcher;
    import flash.events.ProgressEvent;
    import flash.events.HTTPStatusEvent;
    import flash.events.ErrorEvent;
    import flash.events.IOErrorEvent;
    import flash.events.SecurityErrorEvent;
    import flash.net.URLRequest;
    import flash.net.URLStream;
    import flash.utils.ByteArray;
    import flash.utils.setTimeout;

	public class StreamLoader extends EventDispatcher {

        private var _handle:int;
        private var _stream:URLStream;
        private var _hasRange:Boolean = false;
        private var _httpStatusCode:int = -1;
        private var _firstChunkReceived:Boolean = false;

		public function StreamLoader() {

		}

		public function dispose():void {
			if (this._stream !== null) {
                this.abort();
            }
		}

        public function get handle():int {
            return this._handle;
        }

        public function set handle(handle:int):void {
            this._handle = handle;
        }

        public function open(url:String, rangeStart:int = 0):void {
            if (rangeStart !== 0) {
                this._hasRange = true;

                var needAnd:Boolean = true;
                var queryIndex:int = url.indexOf("?");
                if (queryIndex === -1) {
                    url += "?";
                    needAnd = false;
                }

                if (needAnd) {
                    url += "&";
                }

                url += "start=" + rangeStart;
            }

            var request:URLRequest = new URLRequest(url);

            this._stream = new URLStream();
            this._stream.addEventListener(Event.OPEN, onStreamOpen);
            this._stream.addEventListener(Event.COMPLETE, onStreamComplete);
            this._stream.addEventListener(HTTPStatusEvent.HTTP_STATUS, onStreamHttpStatus);
            this._stream.addEventListener(ProgressEvent.PROGRESS, onChunkArrival);
            this._stream.addEventListener(IOErrorEvent.IO_ERROR, onIOException);
            this._stream.addEventListener(SecurityErrorEvent.SECURITY_ERROR, onIOException);

            try {
                this._stream.load(request);
            } catch (error:SecurityError) {
                this.abort();
                setTimeout(function():void {
                    dispatchEvent(new StreamLoaderEvent(StreamLoaderEvent.ERROR, -1, error.message));
                }, 0);
            }
        }

        public function abort():void {
            if (this._stream) {
                if (this._stream.connected) {
                    this._stream.close();
                }
                this._stream.removeEventListener(Event.OPEN, onStreamOpen);
                this._stream.removeEventListener(Event.COMPLETE, onStreamComplete);
                this._stream.removeEventListener(HTTPStatusEvent.HTTP_STATUS, onStreamHttpStatus);
                this._stream.removeEventListener(ProgressEvent.PROGRESS, onChunkArrival);
                this._stream.removeEventListener(IOErrorEvent.IO_ERROR, onIOException);
                this._stream.removeEventListener(SecurityErrorEvent.SECURITY_ERROR, onIOException);
                this._stream = null;
            }
        }

        private function onStreamOpen(event:Event):void {
            super.dispatchEvent(new StreamLoaderEvent(StreamLoaderEvent.OPEN));
        }

        private function onStreamComplete(event:Event):void {
            super.dispatchEvent(new StreamLoaderEvent(StreamLoaderEvent.COMPLETE));
        }

        private function onStreamHttpStatus(event:HTTPStatusEvent):void {
            this._httpStatusCode = event.status;
        }

        private function onChunkArrival(event:ProgressEvent):void {
            if (this._firstChunkReceived === false) {
                if (this._hasRange) {
                    // If request with start param, skip 13-bytes FLV Pseudo-Stream header
                    this._stream.readInt();
                    this._stream.readInt();
                    this._stream.readInt();
                    this._stream.readByte();
                }
                this._firstChunkReceived = true;
            }

            if (this._stream.bytesAvailable > 0) {
                var buffer:ByteArray = new ByteArray();
                this._stream.readBytes(buffer);

                var base64:String = Base64.encode(buffer);
                buffer.clear();

                super.dispatchEvent(new StreamLoaderEvent(StreamLoaderEvent.DATA_ARRIVAL, base64));
            }
        }

        private function onIOException(event:ErrorEvent):void {
            // IOErrorEvent or SecurityErrorEvent
            var code:int = -1;
            var status:int = this._httpStatusCode;

            if (status !== -1 && status !== 0 && (status < 200 || status > 299)) {
                code = this._httpStatusCode;
            }
            super.dispatchEvent(new StreamLoaderEvent(StreamLoaderEvent.ERROR, code, event.text));
        }
	}

}