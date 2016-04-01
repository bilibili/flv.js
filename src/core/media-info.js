class MediaInfo {

    constructor() {
        this.metadata = null;
        this.keyframesIndex = null;
        this.duration = null;
        this.mimeType = null;
        this.audioCodec = null;
        this.videoCodec = null;
        this.audioBitrate = null;
        this.videoBitrate = null;
        this.width = null;
        this.height = null;
        this.fps = null;
        this.profile = null;
        this.chromaFormat = null;
        this.sarNum = null;
        this.sarDen = null;
    }

    isComplete() {
        return this.metadata != null &&
               this.keyframesIndex != null &&
               this.duration != null &&
               this.mimeType != null &&
               this.audioCodec != null &&
               this.videoCodec != null &&
               this.audioBitrate != null &&
               this.videoBitrate != null &&
               this.width != null &&
               this.height != null;
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