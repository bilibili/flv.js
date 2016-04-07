// Represents an media sample (audio / video)
export class SampleInfo {

    constructor(dts, duration, originalDts, isSync) {
        this.dts = dts;
        this.duration = duration;
        this.originalDts = originalDts;
        this.isSyncPoint = isSync;
    }

}

// Media Segment concept is defined in Media Source Extensions spec.
// Particularly in ISO BMFF format, an Media Segment contains a moof box followed by a mdat box.
export class MediaSegmentInfo {

    constructor() {
        this.startDts = 0;
        this.endDts = 0;
        this.syncPoints = [];     // SampleInfo[n], for video IDR frames only
        this.firstSample = null;  // SampleInfo
        this.lastSample = null;   // SampleInfo
    }

    appendSyncPoint(sampleInfo) {  // also called Random Access Point
        sampleInfo.isSyncPoint = true;
        this.syncPoints.push(sampleInfo);
    }

}

// Data structure for recording information of media segments in single track.
export class MediaSegmentInfoList {

    constructor(type) {
        this._type = type;
        this._list = [];
        this._lastAppendLocation = -1;  // cached last insert location
    }

    get type() {
        return this._type;
    }

    _searchNearestSegmentBefore(startDts) {
        let list = this._list;
        let last = list.length - 1;
        let mid = 0;
        let lbound = 0;
        let ubound = last;

        let idx = 0;

        if (startDts < list[0].startDts) {
            idx = -1;
            return idx;
        }

        while (lbound <= ubound) {
            mid = lbound + Math.floor((ubound - lbound) / 2);
            if (mid === last || (startDts >= list[mid].endDts && startDts < list[mid + 1].startDts)) {
                idx = mid;
                break;
            } else if (list[mid].startDts < startDts) {
                lbound = mid + 1;
            } else {
                ubound = mid - 1;
            }
        }
        return idx;
    }

    _searchNearestSegmentAfter(startDts) {
        return this._searchNearestSegmentBefore(startDts) + 1;
    }

    append(mediaSegmentInfo) {
        let list = this._list;
        let msi = mediaSegmentInfo;
        let lastAppendIdx = this._lastAppendLocation;
        let insertIdx = 0;

        if (lastAppendIdx !== -1 && msi.startDts >= list[lastAppendIdx].endDts &&
                                    ((lastAppendIdx === list.length - 1) ||
                                    (lastAppendIdx < list.length - 1 &&
                                    msi.startDts < list[lastAppendIdx + 1].startDts))) {
            insertIdx = lastAppendIdx + 1;  // use cached location idx
        } else {
            if (list.length > 0) {
                insertIdx = this._searchNearestSegmentBefore(msi.startDts) + 1;
            }
        }

        this._lastAppendLocation = insertIdx;
        this._list.splice(insertIdx, 0, msi);
    }

    getLastSegment() {
        if (this._list.length > 0) {
            return this._list[this._list.length - 1];
        } else {
            return null;
        }
    }

    getLastSegmentBefore(startDts) {
        let idx = this._searchNearestSegmentBefore(startDts);
        if (idx >= 0) {
            return this._list[idx];
        } else {  // -1
            return null;
        }
    }

    getLastSampleBefore(startDts) {
        return this.getLastSegmentBefore(startDts).lastSample;
    }

    getLastSyncPointBefore(startDts) {
        let syncPoints = this.getLastSegmentBefore(startDts).syncPoints;
        if (syncPoints.length > 0) {
            return syncPoints[syncPoints.length - 1];
        } else {
            return null;
        }
    }

    getFirstSegmentAfter(startDts) {
        let idx = this._searchNearestSegmentAfter(startDts);
        if (idx >= 0 && idx < this._list.length) {
            return this._list[idx];
        } else {
            return null;
        }
    }

    getFirstSampleAfter(startDts) {
        return this.getFirstSegmentAfter(startDts).firstSample;
    }

}