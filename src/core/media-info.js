class MediaInfo {

    constructor() {
        this.mimeType = null;
        this.duration = null;

        this.hasAudio = null;
        this.hasVideo = null;
        this.audioCodec = null;
        this.videoCodec = null;
        this.audioBitrate = null;
        this.videoBitrate = null;

        this.audioSampleRate = null;
        this.audioChannelCount = null;

        this.width = null;
        this.height = null;
        this.fps = null;
        this.profile = null;
        this.chromaFormat = null;
        this.sarNum = null;
        this.sarDen = null;

        this.metadata = null;
        this.keyframesIndex = null;
    }

    isComplete() {
        let audioInfoComplete = (this.hasAudio === false) ||
                                (this.hasAudio === true &&
                                 this.audioCodec != null &&
                                 this.audioBitrate != null &&
                                 this.audioSampleRate != null &&
                                 this.audioChannelCount != null);

        let videoInfoComplete = (this.hasVideo === false) ||
                                (this.hasVideo === true &&
                                 this.videoCodec != null &&
                                 this.videoBitrate != null &&
                                 this.width != null &&
                                 this.height != null &&
                                 this.fps != null &&
                                 this.profile != null &&
                                 this.chromaFormat != null &&
                                 this.sarNum != null &&
                                 this.sarDen != null);

        // keyframesIndex may not be present
        return this.mimeType != null &&
               this.duration != null &&
               this.metadata != null &&
               audioInfoComplete &&
               videoInfoComplete;
    }

    isSeekable() {
        return (this.keyframesIndex != null);
    }

    getNearestKeyframePosition(milliseconds) {
        if (this.keyframesIndex == null) {
            return null;
        }

        let keyframeIdx = 0;

        // binary search
        let list = this.keyframesIndex.times;
        let last = list.length - 1;
        let mid = 0;
        let lbound = 0;
        let ubound = last;

        if (milliseconds < list[0]) {
            keyframeIdx = 0;
            lbound = ubound + 1;  // skip search
        }

        while (lbound <= ubound) {
            mid = lbound + Math.floor((ubound - lbound) / 2);
            if (mid === last || (milliseconds >= list[mid] && milliseconds < list[mid + 1])) {
                keyframeIdx = mid;
                break;
            } else if (list[mid] < milliseconds) {
                lbound = mid + 1;
            } else {
                ubound = mid - 1;
            }
        }

        let table = this.keyframesIndex;

        return {
            milliseconds: table.times[keyframeIdx],
            fileposition: table.filepositions[keyframeIdx]
        };
    }

}

export default MediaInfo;