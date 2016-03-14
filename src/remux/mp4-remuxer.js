import Log from '../utils/logger.js';
import MP4 from './mp4-generator.js';

// Fragmented mp4 remuxer
class MP4Remuxer {

    constructor() {
        this.TAG = this.constructor.name;

        this._dtsBase = -1;
        this._audioMeta = null;
        this._videoMeta = null;

        this._onInitSegment = null;
        this._onMediaSegment = null;
    }

    destroy() {
        this._audioMeta = null;
        this._videoMeta = null;
        this._onInitSegment = null;
        this._onMediaSegment = null;
    }

    bindDataSource(producer) {
        producer.onDataAvailable = this.remux.bind(this);
        producer.onMetadata = this._onMetadataReceived.bind(this);
        return this;
    }

    // prototype: function onInitSegment(type: string, initSegment: ArrayBuffer): void
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

    remux(audioTrack, videoTrack) {
        Log.v(this.TAG, `Received data, audioSize = ${audioTrack.length}, videoSize = ${videoTrack.length}, nbNalu = ${videoTrack.nbNalu}`);
        if (!this._onMediaSegment) {
            throw 'MP4Remuxer: onMediaSegment callback must be specificed!';
        }
        this._remuxAudio(audioTrack);
        this._remuxVideo(videoTrack);
    }

    _onMetadataReceived(type, metadata) {
        let metabox = null;
        if (type === 'info') {
            // TODO
            Log.v(this.TAG, JSON.stringify(metadata.onMetaData));
        } else if (type === 'audio') {
            this._audioMeta = metadata;
            metabox = MP4.generateInitSegment(metadata);
        } else if (type === 'video') {
            this._videoMeta = metadata;
            metabox = MP4.generateInitSegment(metadata);
        }
        // dispatch metabox (Initialization Segment)
        if (type !== 'info') {
            if (this._onInitSegment) {
                this._onInitSegment(type, metabox.buffer);
            } else {
                throw 'MP4Remuxer: onInitSegment callback must be specified!';
            }
        }
    }

    _remuxAudio(audioTrack) {
        let track = audioTrack;
        let samples = track.samples;
        let firstDts = -1, lastDts = -1;

        if (!samples || samples.length === 0) {
            return;
        }

        if (this._dtsBase === -1) {
            this._dtsBase = samples[0].dts;
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
            let dts = aacSample.dts - this._dtsBase;
            if (firstDts === -1) {
                firstDts = dts;
            }

            let mp4Sample = {
                dts: dts,
                pts: dts,
                cts: 0,
                size: unit.byteLength,
                duration: Math.floor(1024 / this._audioMeta.audioSampleRate * 1000),
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
        lastDts = mp4Samples[mp4Samples.length - 1].dts;
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
            endPts: lastDts
        });
    }

    _remuxVideo(videoTrack) {
        let track = videoTrack;
        let samples = track.samples;
        let firstDts = -1, lastDts = -1;
        let firstPts = -1, lastPts = -1;

        if (!samples || samples.length === 0) {
            return;
        }

        if (this._dtsBase === -1) {
            this._dtsBase = samples[0].dts;
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

        while (samples.length) {
            let avcSample = samples.shift();
            let keyframe = avcSample.isKeyframe;

            let dts = avcSample.dts - this._dtsBase;
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
                let nextDts = samples[0].dts - this._dtsBase;
                sampleDuration = nextDts - dts;
            } else {  // lastest sample. use second last duration
                sampleDuration = mp4Samples[mp4Samples.length - 1].duration;
            }

            let mp4Sample = {
                dts: dts,
                pts: pts,
                cts: cts,
                size: sampleSize,
                duration: sampleDuration,
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
        lastDts = latest.dts;
        lastPts = latest.pts + latest.duration;

        track.samples = mp4Samples;
        track.sequenceNumber++;

        // workaround for chrome: force first sample as a random access point
        if (mp4Samples.length && navigator.userAgent.toLowerCase().indexOf('chrome') > -1) {
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