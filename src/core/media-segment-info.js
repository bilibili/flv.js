// Represents an media sample (audio / video)
export class SampleInfo {

    constructor(dts, pts, duration, originalDts, isSync) {
        this.dts = dts;
        this.pts = pts;
        this.duration = duration;
        this.originalDts = originalDts;
        this.isSyncPoint = isSync;
    }

}

// Media Segment concept is defined in Media Source Extensions spec.
// Particularly in ISO BMFF format, an Media Segment contains a moof box followed by a mdat box.
export class MediaSegmentInfo {

    constructor() {
        this.beginDts = 0;
        this.endDts = 0;
        this.beginPts = 0;
        this.endPts = 0;
        this.originalBeginDts = 0;
        this.originalEndDts = 0;
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

    get length() {
        return this._list.length;
    }

    isEmpty() {
        return this._list.length === 0;
    }

    _searchNearestSegmentBefore(originalBeginDts) {
        let list = this._list;
        if (list.length === 0) {
            return -2;
        }
        let last = list.length - 1;
        let mid = 0;
        let lbound = 0;
        let ubound = last;

        let idx = 0;

        if (originalBeginDts < list[0].originalBeginDts) {
            idx = -1;
            return idx;
        }

        while (lbound <= ubound) {
            mid = lbound + Math.floor((ubound - lbound) / 2);
            if (mid === last || (originalBeginDts > list[mid].lastSample.originalDts &&
                                (originalBeginDts < list[mid + 1].originalBeginDts))) {
                idx = mid;
                break;
            } else if (list[mid].originalBeginDts < originalBeginDts) {
                lbound = mid + 1;
            } else {
                ubound = mid - 1;
            }
        }
        return idx;
    }

    _searchNearestSegmentAfter(originalBeginDts) {
        return this._searchNearestSegmentBefore(originalBeginDts) + 1;
    }

    append(mediaSegmentInfo) {
        let list = this._list;
        let msi = mediaSegmentInfo;
        let lastAppendIdx = this._lastAppendLocation;
        let insertIdx = 0;

        if (lastAppendIdx !== -1 && lastAppendIdx < list.length &&
                                    msi.originalBeginDts >= list[lastAppendIdx].lastSample.originalDts &&
                                    ((lastAppendIdx === list.length - 1) ||
                                    (lastAppendIdx < list.length - 1 &&
                                    msi.originalBeginDts < list[lastAppendIdx + 1].originalBeginDts))) {
            insertIdx = lastAppendIdx + 1;  // use cached location idx
        } else {
            if (list.length > 0) {
                insertIdx = this._searchNearestSegmentBefore(msi.originalBeginDts) + 1;
            }
        }

        this._lastAppendLocation = insertIdx;
        this._list.splice(insertIdx, 0, msi);

    removeSegmentsAfter(originalDts) {
        let list = this._list;
        if (list.length === 0) {
            return;
        }
        let last = list.length - 1;
        let mid = 0;
        let lbound = 0;
        let ubound = last;

        let idx = 0;

        if (originalDts < list[0].originalBeginDts) {
            idx = 0;
            lbound = ubound + 1;
        }

        while (lbound <= ubound) {
            mid = lbound + Math.floor((ubound - lbound) / 2);
            if (mid === last) {  // no segments need to be remove
                return;
            } else if (list[mid].lastSample.originalDts < originalDts && originalDts <= list[mid + 1].originalBeginDts) {
                idx = mid + 1;
                break;
            } else if (list[mid].originalBeginDts <= originalDts && originalDts < list[mid].originalEndDts) {
                idx = mid;
                break;
            } else if (originalDts > list[mid].lastSample.originalDts) {
                lbound = mid + 1;
            } else {
                ubound = mid - 1;
            }
        }

        this._list.splice(idx, this._list.length - idx);
    }

    getLastSegmentBefore(originalBeginDts) {
        let idx = this._searchNearestSegmentBefore(originalBeginDts);
        if (idx >= 0) {
            return this._list[idx];
        } else {  // -1
            return null;
        }
    }

    getLastSampleBefore(originalBeginDts) {
        let segment = this.getLastSegmentBefore(originalBeginDts);
        if (segment != null) {
            return segment.lastSample;
        } else {
            return null;
        }
    }

    getLastSyncPointBefore(originalBeginDts) {
        let segmentIdx = this._searchNearestSegmentBefore(originalBeginDts);
        let syncPoints = this._list[segmentIdx].syncPoints;
        while (syncPoints.length === 0 && segmentIdx > 0) {
            segmentIdx--;
            syncPoints = this._list[segmentIdx].syncPoints;
        }
        if (syncPoints.length > 0) {
            return syncPoints[syncPoints.length - 1];
        } else {
            return null;
        }
    }

}