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

    public class StreamLoaderEvent extends Event {

        public static const OPEN:String = "open";
        public static const COMPLETE:String = "complete";
        public static const DATA_ARRIVAL:String = "data_arrival";
        public static const ERROR:String = "error";

        public var data1:*;
        public var data2:*;

        public function StreamLoaderEvent(type:String, data1:* = null, data2:* = null, bubbles:Boolean = false) {
            super(type, bubbles);
            this.data1 = data1;
            this.data2 = data2;
        }

        public override function clone():Event {
            return new StreamLoaderEvent(type, data1, data2, bubbles);
        }

    }

}