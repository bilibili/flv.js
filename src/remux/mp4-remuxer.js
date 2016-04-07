import Log from '../utils/logger.js';
import MP4 from './mp4-generator.js';
import {SampleInfo, MediaSegmentInfo, MediaSegmentInfoList} from './media-segment-info.js';

// Fragmented mp4 remuxer
class MP4Remuxer {

    constructor() {
        this.TAG = this.constructor.name;

        this._dtsBase = -1;
        this._dtsBaseInited = false;
        this._audioDtsBase = Infinity;
        this._videoDtsBase = Infinity;
        this._audioNextDts = undefined;
        this._videoNextDts = undefined;

        this._audioMeta = null;
        this._videoMeta = null;

        this._audioSegmentInfoList = new MediaSegmentInfoList('audio');
        this._videoSegmentInfoList = new MediaSegmentInfoList('video');

        this._onInitSegment = null;
        this._onMediaSegment = null;

        this._isChrome = false; //(self.navigator.userAgent.toLowerCase().indexOf('chrome') > -1);
    }

    destroy() {
        this._audioMeta = null;
        this._videoMeta = null;
        this._audioSegmentInfoList = null;
        this._videoSegmentInfoList = null;
        this._onInitSegment = null;
        this._onMediaSegment = null;
    }

    bindDataSource(producer) {
        producer.onDataAvailable = this.remux.bind(this);
        producer.onTrackMetadata = this._onTrackMetadataReceived.bind(this);
        return this;
    }

    /* prototype: function onInitSegment(type: string, initSegment: ArrayBuffer): void
       InitSegment: {
           type: string,
           data: ArrayBuffer,
           codec: string,
           container: string
       }
    */
    get onInitSegment() {
        return this._onInitSegment;
    }

    set onInitSegment(callback) {
        if (typeof callback !== 'function')
            throw 'onInitSegment must be a callback function!';
        this._onInitSegment = callback;
    }

    /* prototype: function onMediaSegment(type: string, mediaSegment: MediaSegment): void
       MediaSegment: {
           type: string,
           data: ArrayBuffer,
           sampleCount: int32
           startDts: int32,
           endDts: int32,
           startPts: int32,
           endPts: int32
       }
    */
    get onMediaSegment() {
        return this._onMediaSegment;
    }

    set onMediaSegment(callback) {
        if (typeof callback !== 'function')
            throw 'onMediaSegment must be a callback function!';
        this._onMediaSegment = callback;
    }

    insertDiscontinuity() {
        this._audioNextDts = this._videoNextDts = undefined;
    }

    remux(audioTrack, videoTrack) {
        if (!this._onMediaSegment) {
            throw 'MP4Remuxer: onMediaSegment callback must be specificed!';
        }
        this._remuxAudio(audioTrack);
        this._remuxVideo(videoTrack);
    }

    _onTrackMetadataReceived(type, metadata) {
        let metabox = null;

        if (type === 'audio') {
            this._audioMeta = metadata;
            metabox = MP4.generateInitSegment(metadata);
        } else if (type === 'video') {
            this._videoMeta = metadata;
            metabox = MP4.generateInitSegment(metadata);
        } else {
            return;
        }

        // dispatch metabox (Initialization Segment)
        if (!this._onInitSegment) {
            throw 'MP4Remuxer: onInitSegment callback must be specified!';
        }
        this._onInitSegment(type, {
            type: type,
            data: metabox.buffer,
            codec: metadata.codec,
            container: `${type}/mp4`
        });
    }

    _remuxAudio(audioTrack) {
        let track = audioTrack;
        let samples = track.samples;
        let dtsCorrection = -1;
        let firstDts = -1, lastDts = -1, lastPts = -1;

        if (!samples || samples.length === 0) {
            return;
        }

        if (!this._dtsBaseInited) {
            this._audioDtsBase = samples[0].dts;
            if (this._audioDtsBase === Infinity || this._videoDtsBase === Infinity) {
                this._dtsBase = 0;
            } else {
                this._dtsBase = Math.min(this._audioDtsBase, this._videoDtsBase);
                this._dtsBaseInited = true;
            }
        }

        let bytes = 8 + track.length;
        let mdatbox = new Uint8Array(bytes);
        mdatbox[0] = (bytes >>> 24) & 0xFF;
        mdatbox[1] = (bytes >>> 16) & 0xFF;
        mdatbox[2] = (bytes >>>  8) & 0xFF;
        mdatbox[3] = (bytes) & 0xFF;

        mdatbox.set(MP4.types.mdat, 4);

        let offset = 8;  // size + type
        let mp4Samples = [];

        while (samples.length) {
            let aacSample = samples.shift();
            let unit = aacSample.unit;

            if (dtsCorrection === -1) {
                if (this._audioNextDts == undefined) {
                    dtsCorrection = 0;
                } else {
                    dtsCorrection = (aacSample.dts - this._dtsBase) - this._audioNextDts;
                }
            }

            let dts = aacSample.dts - this._dtsBase - dtsCorrection;
            if (firstDts === -1) {
                firstDts = dts;
            }

            let sampleDuration = 0;

            if (samples.length >= 1) {
                let nextDts = samples[0].dts - this._dtsBase - dtsCorrection;
                sampleDuration = nextDts - dts;
            } else {
                if (mp4Samples.length >= 1) {  // use second last sample duration
                    sampleDuration = mp4Samples[mp4Samples.length - 1].duration;
                } else {  // the only one sample, calculate from aac sample rate.
                    // The decode result of an aac sample is 1024 PCM samples
                    let sampleRate = this._audioMeta.audioSampleRate;
                    let timescale = this._audioMeta.timescale;
                    sampleDuration = Math.floor(1024 / sampleRate * timescale);
                }
            }

            let mp4Sample = {
                dts: dts,
                pts: dts,
                cts: 0,
                size: unit.byteLength,
                duration: sampleDuration,
                originalDts: aacSample.dts,
                flags: {
                    isLeading: 0,
                    dependsOn: 1,
                    isDependedOn: 0,
                    hasRedundancy: 0
                }
            };
            mp4Samples.push(mp4Sample);
            mdatbox.set(unit, offset);
            offset += unit.byteLength;
        }
        let latest = mp4Samples[mp4Samples.length - 1];
        lastDts = latest.dts + latest.duration;
        lastPts = lastDts;
        this._audioNextDts = lastDts;

        // fill media segment info & add to info list
        let info = new MediaSegmentInfo();
        info.startDts = firstDts;
        info.endDts = lastDts;
        info.firstSample = new SampleInfo(mp4Samples[0].dts,
                                          mp4Samples[0].duration,
                                          mp4Samples[0].originalDts,
                                          false);
        info.lastSample = new SampleInfo(latest.dts,
                                         latest.duration,
                                         latest.originalDts,
                                         false);
        this._audioSegmentInfoList.append(info);

        track.samples = mp4Samples;
        track.sequenceNumber++;

        let moofbox = MP4.moof(track, firstDts);
        track.samples = [];
        track.length = 0;

        this._onMediaSegment('audio', {
            type: 'audio',
            data: this._mergeBoxes(moofbox, mdatbox).buffer,
            sampleCount: mp4Samples.length,
            startDts: firstDts,
            endDts: lastDts,
            startPts: firstDts,
            endPts: lastPts
        });
    }

    _remuxVideo(videoTrack) {
        let track = videoTrack;
        let samples = track.samples;
        let dtsCorrection = -1;
        let firstDts = -1, lastDts = -1;
        let firstPts = -1, lastPts = -1;

        if (!samples || samples.length === 0) {
            return;
        }

        if (!this._dtsBaseInited) {
            this._videoDtsBase = samples[0].dts;
            if (this._audioDtsBase === Infinity || this._videoDtsBase === Infinity) {
                this._dtsBase = 0;
            } else {
                this._dtsBase = Math.min(this._audioDtsBase, this._videoDtsBase);
                this._dtsBaseInited = true;
            }
        }

        let bytes = 8 + videoTrack.length;
        let mdatbox = new Uint8Array(bytes);
        mdatbox[0] = (bytes >>> 24) & 0xFF;
        mdatbox[1] = (bytes >>> 16) & 0xFF;
        mdatbox[2] = (bytes >>>  8) & 0xFF;
        mdatbox[3] = (bytes) & 0xFF;
        mdatbox.set(MP4.types.mdat, 4);

        let offset = 8;
        let mp4Samples = [];
        let info = new MediaSegmentInfo();

        while (samples.length) {
            let avcSample = samples.shift();
            let keyframe = avcSample.isKeyframe;

            if (dtsCorrection === -1) {
                if (this._videoNextDts == undefined) {
                    dtsCorrection = 0;
                } else {
                    dtsCorrection = (avcSample.dts - this._dtsBase) - this._videoNextDts;
                }
            }

            let dts = avcSample.dts - this._dtsBase - dtsCorrection;
            let cts = avcSample.cts;
            let pts = dts + cts;

            if (firstDts === -1) {
                firstDts = dts;
                firstPts = pts;
            }

            // fill mdat box
            let sampleSize = 0;
            while (avcSample.units.length) {
                let unit = avcSample.units.shift();
                let data = unit.data;
                mdatbox.set(data, offset);
                offset += data.byteLength;
                sampleSize += data.byteLength;
            }

            let sampleDuration = 0;

            if (samples.length >= 1) {
                let nextDts = samples[0].dts - this._dtsBase - dtsCorrection;
                sampleDuration = nextDts - dts;
            } else {
                if (mp4Samples.length >= 1) {  // lastest sample, use second last duration
                    sampleDuration = mp4Samples[mp4Samples.length - 1].duration;
                } else {  // the only one sample, calculate duration from fps
                    let timescale = this._videoMeta.timescale;
                    let fps_den = this._videoMeta.frameRate.fps_den;
                    let fps_num = this._videoMeta.frameRate.fps_num;
                    sampleDuration = Math.floor(timescale * (fps_den / fps_num));
                }
            }

            if (keyframe) {
                let syncPoint = new SampleInfo(dts, sampleDuration, avcSample.dts, true);
                info.appendSyncPoint(syncPoint);
            }

            let mp4Sample = {
                dts: dts,
                pts: pts,
                cts: cts,
                size: sampleSize,
                isKeyframe: keyframe,
                duration: sampleDuration,
                originalDts: avcSample.dts,
                flags: {
                    isLeading: 0,
                    dependsOn: keyframe ? 2 : 1,
                    isDependedOn: keyframe ? 1 : 0,
                    hasRedundancy: 0,
                    isNonSync: keyframe ? 0 : 1
                }
            };

            mp4Samples.push(mp4Sample);
        }
        let latest = mp4Samples[mp4Samples.length - 1];
        lastDts = latest.dts + latest.duration;
        lastPts = latest.pts + latest.duration;
        this._videoNextDts = lastDts;

        // fill media segment info & add to info list
        info.startDts = firstDts;
        info.endDts = lastDts;
        info.firstSample = new SampleInfo(mp4Samples[0].dts,
                                          mp4Samples[0].duration,
                                          mp4Samples[0].originalDts,
                                          mp4Samples[0].isKeyframe);
        info.lastSample = new SampleInfo(latest.dts,
                                         latest.duration,
                                         latest.originalDts,
                                         latest.isKeyframe);
        this._videoSegmentInfoList.append(info);

        track.samples = mp4Samples;
        track.sequenceNumber++;

        // workaround for chrome: force first sample as a random access point
        if (this._isChrome) {
            let flags = mp4Samples[0].flags;
            flags.dependsOn = 2;
            flags.isNonSync = 0;
        }

        let moofbox = MP4.moof(track, firstDts);
        track.samples = [];
        track.length = 0;
        track.nbNalu = 0;

        this._onMediaSegment('video', {
            type: 'video',
            data: this._mergeBoxes(moofbox, mdatbox).buffer,
            sampleCount: mp4Samples.length,
            startDts: firstDts,
            endDts: lastDts,
            startPts: firstPts,
            endPts: lastPts
        });
    }

    _mergeBoxes(moof, mdat) {
        let result = new Uint8Array(moof.byteLength + mdat.byteLength);
        result.set(moof, 0);
        result.set(mdat, moof.byteLength);
        return result;
    }

}

export default MP4Remuxer;