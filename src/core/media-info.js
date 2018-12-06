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

class MediaInfo {

    constructor() {
        this.mimeType = null;
        this.duration = null;

        this.hasAudio = null;
        this.hasVideo = null;
        this.audioCodec = null;
        this.videoCodec = null;
        this.audioDataRate = null;
        this.videoDataRate = null;

        this.audioSampleRate = null;
        this.audioChannelCount = null;

        this.width = null;
        this.height = null;
        this.fps = null;
        this.profile = null;
        this.level = null;
        this.refFrames = null;
        this.chromaFormat = null;
        this.sarNum = null;
        this.sarDen = null;

        this.metadata = null;
        this.segments = null;  // MediaInfo[]
        this.segmentCount = null;
        this.hasKeyframesIndex = null;
        this.keyframesIndex = null;
    }

    isComplete() {
        let audioInfoComplete = (this.hasAudio === false) ||
                                (this.hasAudio === true &&
                                 this.audioCodec != null &&
                                 this.audioSampleRate != null &&
                                 this.audioChannelCount != null);

        let videoInfoComplete = (this.hasVideo === false) ||
                                (this.hasVideo === true &&
                                 this.videoCodec != null &&
                                 this.width != null &&
                                 this.height != null &&
                                 this.fps != null &&
                                 this.profile != null &&
                                 this.level != null &&
                                 this.refFrames != null &&
                                 this.chromaFormat != null &&
                                 this.sarNum != null &&
                                 this.sarDen != null);

        // keyframesIndex may not be present
        return this.mimeType != null &&
               this.duration != null &&
               this.metadata != null &&
               this.hasKeyframesIndex != null &&
               audioInfoComplete &&
               videoInfoComplete;
    }

    isSeekable() {
        return this.hasKeyframesIndex === true;
    }

    getNearestKeyframe(milliseconds) {
        if (this.keyframesIndex == null) {
            return null;
        }

        let table = this.keyframesIndex;
        let keyframeIdx = this._search(table.times, milliseconds);

        return {
            index: keyframeIdx,
            milliseconds: table.times[keyframeIdx],
            fileposition: table.filepositions[keyframeIdx]
        };
    }

    _search(list, value) {
        let idx = 0;

        let last = list.length - 1;
        let mid = 0;
        let lbound = 0;
        let ubound = last;

        if (value < list[0]) {
            idx = 0;
            lbound = ubound + 1;  // skip search
        }

        while (lbound <= ubound) {
            mid = lbound + Math.floor((ubound - lbound) / 2);
            if (mid === last || (value >= list[mid] && value < list[mid + 1])) {
                idx = mid;
                break;
            } else if (list[mid] < value) {
                lbound = mid + 1;
            } else {
                ubound = mid - 1;
            }
        }

        return idx;
    }

}

export default MediaInfo;