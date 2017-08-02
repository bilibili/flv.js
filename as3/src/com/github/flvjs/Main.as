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

    import flash.display.Sprite;
    import flash.events.Event;
    import flash.events.ProgressEvent;
    import flash.external.ExternalInterface;
    import flash.utils.setTimeout;

    public class Main extends Sprite {

        private static const EVENT_SWF_LOADED:String = "__flvjs_flashBridge._onSwfLoaded"
        private static const EVENT_OPEN:String = "__flvjs_flashBridge._onOpen";
        private static const EVENT_COMPLETE:String = "__flvjs_flashBridge._onComplete";
        private static const EVENT_DATA_ARRIVAL:String = "__flvjs_flashBridge._onDataArrival";
        private static const EVENT_ERROR:String = "__flvjs_flashBridge._onError";

        private var _loaderList:Array = [undefined];

        public function Main() {
            if (stage) init();
            else addEventListener(Event.ADDED_TO_STAGE, init);
        }

        private function init(e:Event = null):void {
            removeEventListener(Event.ADDED_TO_STAGE, init);

            if (!ExternalInterface.available) {
                trace("ExternalInterface unavailable, JavaScript interop dekimasenn!");
                return;
            }

            ExternalInterface.addCallback("create", create);
            ExternalInterface.addCallback("destroy", destroy);
            ExternalInterface.addCallback("open", open);
            ExternalInterface.addCallback("abort", abort);

            setTimeout(function():void {
                ExternalInterface.call(EVENT_SWF_LOADED);
            }, 0);
        }

        private function create():int {
            var loader:StreamLoader = new StreamLoader();
            loader.addEventListener(StreamLoaderEvent.OPEN, onLoaderOpen);
            loader.addEventListener(StreamLoaderEvent.COMPLETE, onLoaderComplete);
            loader.addEventListener(StreamLoaderEvent.DATA_ARRIVAL, onLoaderDataArrival);
            loader.addEventListener(StreamLoaderEvent.ERROR, onLoaderError);

            var handle:int = 0;

            for (var i:int = 1; i < this._loaderList.length; i++) {
                if (this._loaderList[i] == undefined) {
                    this._loaderList[i] = loader;
                    handle = i;
                    break;
                }
            }

            if (handle === 0) {
                this._loaderList.push(loader);
                handle = this._loaderList.length - 1;
            }

            loader.handle = handle;
            return handle;
        }

        private function destroy(handle:int):void {
            var loader:StreamLoader = this._loaderList[handle];
            if (!loader) return;

            loader.removeEventListener(StreamLoaderEvent.OPEN, onLoaderOpen);
            loader.removeEventListener(StreamLoaderEvent.COMPLETE, onLoaderComplete);
            loader.removeEventListener(StreamLoaderEvent.DATA_ARRIVAL, onLoaderDataArrival);
            loader.removeEventListener(StreamLoaderEvent.ERROR, onLoaderError);
            loader.dispose();

            this._loaderList[handle] = undefined;
        }

        private function open(handle:int, url:String, rangeStart:int):void {
            var loader:StreamLoader = this._loaderList[handle];
            if (!loader) return;

            loader.open(url, rangeStart);
        }

        private function abort(handle:int):void {
            var loader:StreamLoader = this._loaderList[handle];
            if (!loader) return;

            loader.abort();
        }

        private function onLoaderOpen(event:StreamLoaderEvent):void {
            var loader:StreamLoader = StreamLoader(event.target);
            ExternalInterface.call(EVENT_OPEN, loader.handle);
        }

        private function onLoaderComplete(event:StreamLoaderEvent):void {
            var loader:StreamLoader = StreamLoader(event.target);
            ExternalInterface.call(EVENT_COMPLETE, loader.handle);
        }

        private function onLoaderDataArrival(event:StreamLoaderEvent):void {
            var loader:StreamLoader = StreamLoader(event.target);
            ExternalInterface.call(EVENT_DATA_ARRIVAL, loader.handle, event.data1);
        }

        private function onLoaderError(event:StreamLoaderEvent):void {
            var loader:StreamLoader = StreamLoader(event.target);
            ExternalInterface.call(EVENT_ERROR, loader.handle, event.data1, event.data2);
        }

    }

}