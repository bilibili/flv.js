import Log from '../utils/logger.js';
import AMF from './amf-parser.js';
import SPSParser from './sps-parser.js';

function Swap16(src) {
    return (((src >>> 8) & 0xFF) |
            ((src & 0xFF) << 8));
}

function Swap32(src) {
    return (((src & 0xFF000000) >>> 24) |
            ((src & 0x00FF0000) >>> 8)  |
            ((src & 0x0000FF00) << 8)   |
            ((src & 0x000000FF) << 24));
}

function ReadBig32(array, index) {
    return ((array[index] << 24)     |
            (array[index + 1] << 16) |
            (array[index + 2] << 8)  |
            (array[index + 3]));
}


class FlvDemuxer {

    // TODO: throw should be error callback

    constructor(probeData) {
        this.TAG = this.constructor.name;

        this._onDataAvailable = null;

        this._hasAudioTrack = probeData.hasAudioTrack;
        this._hasVideoTrack = probeData.hasVideoTrack;
        this._dataOffset = probeData.dataOffset;
        this._firstParse = true;

        this._metadata = null;
        this._naluLengthSize = 4;
        this._timestampBase = 0;

        if (this._hasAudioTrack) {
            this._audioTrack = {type: 'audio', samples: [], length: 0};
        }

        if (this._hasVideoTrack) {
            this._videoTrack = {type: 'video', samples: [], length: 0, nbNalu: 0};
        }

        this._littleEndian = (function () {
            let buf = new ArrayBuffer(2);
            (new DataView(buf)).setInt16(0, 256, true);  // little-endian write
            return (new Int16Array(buf))[0] === 256;  // platform-spec read, if equal then LE
        })();
    }

    destroy() {

    }

    static probe(buffer) {
        let data = new Uint8Array(buffer);
        let mismatch = {match: false};

        if (data[0] !== 0x46 || data[1] !== 0x4C || data[2] !== 0x56 || data[3] !== 0x01) {
            return mismatch;
        }

        if ((data[4] >>> 3) !== 0 || (data[4] & 2) !== 0) {  // two reserved flags
            return mismatch;
        }

        let hasAudio = ((data[4] & 4) >>> 2) !== 0;
        let hasVideo = (data[4] & 1) !== 0;

        if (!hasAudio && !hasVideo) {
            return mismatch;
        }

        let offset = ReadBig32(data, 5);

        if (offset < 9) {
            return mismatch;
        }

        return {
            match: true,
            consumed: offset,
            dataOffset: offset,
            hasAudioTrack: hasAudio,
            hasVideoTrack: hasVideo
        };
    }

    bindDataSource(loader) {
        loader.onDataArrival = this.parseChunks.bind(this);
        return this;
    }

    // TODO: onError callback (need asynchronize?)
    // TODO: onMetaData callback (pass metadatas)

    // prototype: function(videoTrack, audioTrack)
    get onDataAvailable() {
        return this._onDataAvailable;
    }

    set onDataAvailable(callback) {
        if (typeof callback !== 'function') {
            throw 'onDataAvailable must be a callback function!';
        }

        this._onDataAvailable = callback;
    }

    get timestampBase() {
        return this._timestampBase;
    }

    set timestampBase(base) {
        this._timestampBase = base;
    }

    // function parseChunks(chunk: ArrayBuffer, byteStart: number): number;
    parseChunks(chunk, byteStart) {
        Log.v(this.TAG, 'FlvDemuxer: received chunk start = ' + byteStart + ', size = ' + chunk.byteLength);

        let offset = 0;
        let le = this._littleEndian;

        if (this._firstParse) {  // handle PreviousTagSize0 before Tag1
            this._firstParse = false;
            if (byteStart !== this._dataOffset) {
                throw 'Flv: First time parsing but chunk byteStart invalid!';
            }

            let v = new DataView(chunk);
            let prevTagSize0 = v.getUint32(0, !le);
            if (prevTagSize0 !== 0) {
                throw 'Flv: PrevTagSize0 !== 0 !!!';
            }
            offset += 4;
        }

        while (offset < chunk.byteLength) {
            let v = new DataView(chunk, offset);

            if (offset + 11 + 4 > chunk.byteLength) {
                // data not enough for parsing an flv tag
                break;
            }

            let tagType = v.getUint8(0);

            let dataSize = v.getUint32(0, !le) & 0x00FFFFFF;

            if (offset + 11 + dataSize + 4 > chunk.byteLength) {
                // data not enough for parsing actual data body
                break;
            }

            if (tagType !== 8 && tagType !== 9 && tagType !== 18) {
                Log.w(this.TAG, 'Flv: Unsupported tag type ' + tagType);
                // consume the whole tag (skip it)
                offset += 11 + dataSize + 4;
                continue;
            }

            let ts2 = v.getUint8(4);
            let ts1 = v.getUint8(5);
            let ts0 = v.getUint8(6);
            let ts3 = v.getUint8(7);

            let timestamp = ts0 | (ts1 << 8) | (ts2 << 16) | (ts3 << 24);

            let streamId = v.getUint32(7, !le) & 0x00FFFFFF;
            if (streamId !== 0) {
                // TODO: ignore and print logcat?
                throw 'Flv: Meet tag which has StreamID != 0!';
            }

            let dataOffset = offset + 11;

            switch (tagType) {
                case 8:  // Audio
                    this._parseAudioData(chunk, dataOffset, dataSize, timestamp);
                    break;
                case 9:  // Video
                    this._parseVideoData(chunk, dataOffset, dataSize, timestamp);
                    break;
                case 18:  // ScriptDataObject
                    Log.v(this.TAG, 'Flv: Found onMetadata');
                    this._metadata = AMF.parseScriptData(chunk, dataOffset, dataSize);
                    break;
            }

            let prevTagSize = v.getUint32(11 + dataSize, !le);
            if (prevTagSize !== 11 + dataSize) {
                throw 'Flv: Invalid PrevTagSize ' + prevTagSize;
            }

            offset += 11 + dataSize + 4;  // tagBody + dataSize + prevTagSize
        }

        if (this._onDataAvailable) {
            this._onDataAvailable(this._audioTrack, this._videoTrack);
        } else {
            throw 'Flv: No existing consumer (onDataAvailable) callback!';
        }

        return offset;  // consumed bytes, just equals latest offset index
    }

    _parseAudioData(arrayBuffer, dataOffset, dataSize, tagTimestamp) {
        let track = this._audioTrack;

        if (!track.codec) {
            // initial metadata
            let le = this._littleEndian;
            let v = new DataView(arrayBuffer, dataOffset, dataSize);

            let soundSpec = v.getUint8(0);

            let soundFormat = soundSpec >>> 4;
            if (soundFormat !== 10) {  // AAC
                // TODO: support MP3 audio codec
                throw 'Flv: Unsupported audio codec!';
            }

            let soundRate = 0;
            let soundRateIndex = (soundSpec & 12) >>> 2;
            switch (soundRateIndex) {
                case 0:
                    soundRate = 5500;
                    break;
                case 1:
                    soundRate = 11025;
                    break;
                case 2:
                    soundRate = 22050;
                    break;
                case 3:
                    soundRate = 44100;
                    break;
                case 4:
                    soundRate = 48000;
                    break;
                default:
                    throw 'Flv: Unsupported audio sample rate!';
            }

            let soundSize = (soundSpec & 2) >>> 1;  // unused
            let soundType = (soundSpec & 1);

            track.audioSampleRate = soundRate;
            track.channelCount = (soundType === 0 ? 1 : 2);
            track.codec = 'mp4a.40.5';  // TODO: browser manifest codec consideration
        }

        let aacData = this._parseAACAudioData(arrayBuffer, dataOffset + 1, dataSize - 1);

        if (aacData.packetType === 0) {  // AAC sequence header (AudioSpecificConfig)
            if (track.config) {
                Log.v(this.TAG, 'Found another AACSequenceHeader!');
                // TODO: throw or ignore?
            } else {
                let misc = aacData.data;
                track.audioSampleRate = misc.samplingRate;
                track.channelCount = misc.channelCount;
                track.codec = misc.codec;
                track.config = misc.config;
                Log.v(this.TAG, 'Parsed AACSequenceHeader (AudioSpecificConfig)');
            }
            return;
        } else if (aacData.packetType === 1) {  // AAC raw frame data
            Log.v(this.TAG, 'AAC Raw data packet');
            let dts = tagTimestamp * 90;
            let aacSample = {unit: aacData.data, dts: dts, pts: dts};
            track.samples.push(aacSample);
            track.length += aacData.data.length;
        } else {
            // TODO
            throw 'Flv: Unsupported AAC data type!';
        }
    }

    _parseAACAudioData(arrayBuffer, dataOffset, dataSize) {
        let result = {};
        let array = new Uint8Array(arrayBuffer, dataOffset, dataSize);

        result.packetType = array[0];

        if (array[0] === 0) {
            result.data = this._parseAACAudioSpecificConfig(arrayBuffer, dataOffset + 1, dataSize - 1);
        } else {
            result.data = array.subarray(1);
        }

        return result;
    }

    _parseAACAudioSpecificConfig(arrayBuffer, dataOffset, dataSize) {
        let array = new Uint8Array(arrayBuffer, dataOffset, dataSize);
        let config = null;

        let mpegSamplingRates = [
            96000, 88200, 64000, 48000, 44100, 32000,
            24000, 22050, 16000, 12000, 11025, 8000, 7350
        ];

        /* Audio Object Type:
           0: Null
           1: AAC Main
           2: AAC LC
           3: AAC SSR (Scalable Sample Rate)
           4: AAC LTP (Long Term Prediction)
           5: HE-AAC / SBR (Spectral Band Replication)
           6: AAC Scalable
        */

        let audioObjectType = 0;
        let audioExtensionObjectType = null;
        let samplingIndex = 0;
        let extensionSamplingIndex = null;

        // 5 bits
        audioObjectType = array[0] >>> 3;
        // 4 bits
        samplingIndex = ((array[0] & 0x07) << 1) | (array[1] >>> 7);
        if (samplingIndex < 0 || samplingIndex >= mpegSamplingRates.length) {
            throw 'Flv: AAC invalid sampling frequency index!';
        }

        let samplingFrequence = mpegSamplingRates[samplingIndex];

        // 4 bits
        let channelConfig = (array[1] & 0x78) >>> 3;
        if (channelConfig < 0 || channelConfig >= 8) {
            throw 'Flv: AAC invalid channel configuration';
        }

        if (audioObjectType === 5) {  // HE-AAC?
            // 4 bits
            extensionSamplingIndex = ((array[1] & 0x07) << 1) | (array[2] >>> 7);
            // 5 bits
            audioExtensionObjectType = (array[2] & 0x7C) >>> 2;
        }

        // workarounds for various browsers
        let userAgent = self.navigator.userAgent.toLowerCase();

        if (userAgent.indexOf('firefox') !== -1) {
            // firefox: use SBR (HE-AAC) if freq less than 24kHz
            if (samplingIndex >= 6) {
                audioObjectType = 5;
                config = new Uint8Array(4);
                extensionSamplingIndex = samplingIndex - 3;
            } else {  // use LC-AAC
                audioObjectType = 2;
                config = new Uint8Array(2);
                extensionSamplingIndex = samplingIndex;
            }
        } else if (userAgent.indexOf('android') !== -1) {
            // android: always use LC-AAC
            audioObjectType = 2;
            config = new Uint8Array(2);
            extensionSamplingIndex = samplingIndex;
        } else {
            // for other browsers, e.g. chrome...
            // Always use HE-AAC to make it easier to switch aac codec profile
            audioObjectType = 5;
            config = new Uint8Array(4);

            // TODO: browser manifest codec consideration
            if (samplingIndex >= 6) {
                extensionSamplingIndex = samplingIndex - 3;
            } else if (channelConfig === 1) {  // Mono channel
                audioObjectType = 2;
                config = new Uint8Array(2);
                extensionSamplingIndex = samplingIndex;
            }
        }

        config[0]  = audioObjectType << 3;
        config[0] |= (samplingIndex & 0x0F) >>> 1;
        config[1]  = (samplingIndex & 0x0F) << 7;
        config[1] |= (channelConfig & 0x0F) << 3;
        if (audioObjectType === 5) {
            config[1] |= ((extensionSamplingIndex & 0x0F) >>> 1);
            config[2]  = (extensionSamplingIndex & 0x01) << 7;
            // extended audio object type: force to 2 (LC-AAC)
            config[2] |= (2 << 2);
            config[3]  = 0;
        }

        return {
            config: config,
            samplingRate: samplingFrequence,
            channelCount: channelConfig,
            codec: 'mp4a.40.' + audioObjectType
        };
    }

    _parseVideoData(arrayBuffer, dataOffset, dataSize, tagTimestamp) {
        let spec = (new Uint8Array(arrayBuffer, dataOffset, dataSize))[0];

        let frameType = (spec & 240) >>> 4;  // unused
        let codecId = spec & 15;

        if (codecId !== 7) {
            throw 'Flv: Detect unsupported codec in video frame!';
        }

        this._parseAVCVideoPacket(arrayBuffer, dataOffset + 1, dataSize - 1, tagTimestamp);
    }

    _parseAVCVideoPacket(arrayBuffer, dataOffset, dataSize, tagTimestamp) {
        if (dataSize < 4) {
            Log.w(this.TAG, 'Invalid AVC packet, missing AVCPacketType or/and CompositionTime');
            return;
        }

        let le = this._littleEndian;
        let v = new DataView(arrayBuffer, dataOffset, dataSize);

        let packetType = v.getUint8(0);
        let cts = v.getUint32(0, !le) & 0x00FFFFFF;

        if (packetType === 0) {  // AVCDecoderConfigurationRecord
            Log.v(this.TAG, 'Found AVCDecoderConfigurationRecord');
            this._parseAVCDecoderConfigurationRecord(arrayBuffer, dataOffset + 4, dataSize - 4);
        } else if (packetType === 1) {  // One or more Nalus
            this._parseAVCVideoData(arrayBuffer, dataOffset + 4, dataSize - 4, tagTimestamp, cts);
        } else if (packetType === 2) {
            // empty, AVC end of sequence
        } else {
            throw 'Flv: Detect invalid video packet type!';
        }
    }

    _parseAVCDecoderConfigurationRecord(arrayBuffer, dataOffset, dataSize) {
        let le = this._littleEndian;
        let track = this._videoTrack;
        let v = new DataView(arrayBuffer, dataOffset, dataSize);

        let version = v.getUint8(0);
        let avcProfile = v.getUint8(1);
        let profileCompatibility = v.getUint8(2);
        let avcLevel = v.getUint8(3);

        if (version !== 1 || avcProfile === 0) {
            throw 'Flv: Invalid AVCDecoderConfigurationRecord';
        }

        this._naluLengthSize = (v.getUint8(4) & 3) + 1;  // lengthSizeMinusOne
        if (this._naluLengthSize !== 3 && this._naluLengthSize !== 4) {  // holy shit!!!
            throw `Flv: Strange NaluLengthSizeMinusOne: ${this._naluLengthSize - 1}`;
        }

        let spsCount = v.getUint8(5) & 31;
        Log.v(this.TAG, 'SPS count = ' + spsCount);
        if (spsCount === 0) {
            throw 'Flv: No H264 SPS!';
        } else if (spsCount > 1) {
            Log.w(this.TAG, 'AVCDecoderConfigurationRecord: Detect more than one SPS!');
        }

        let offset = 6;

        for (let i = 0; i < spsCount; i++) {
            let len = v.getUint16(offset, !le);
            offset += 2;

            if (len === 0) {
                continue;
            }

            let sps = new Uint8Array(arrayBuffer, dataOffset + offset, len);
            offset += len;

            let config = SPSParser.parseSPS(sps);
            track.width = config.codecSize.width;
            track.height = config.codecSize.height;
            track.sps = [sps];

            let codecArray = sps.subarray(1, 4);
            let codecString = 'avc1.';
            for (let j = 0; j < 3; j++) {
                let h = codecArray[j].toString(16);
                if (h.length < 2) {
                    h = '0' + h;
                }
                codecString += h;
            }
            track.codec = codecString;
        }

        let ppsCount = v.getUint8(offset);
        Log.v(this.TAG, 'PPS count = ' + ppsCount);
        if (ppsCount === 0) {
            throw 'Flv: No H264 PPS!';
        } else if (ppsCount > 1) {
            Log.w(this.TAG, 'AVCDecoderConfigurationRecord: Detect more than one PPS!');
        }

        offset++;

        for (let i = 0; i < ppsCount; i++) {
            let len = v.getUint16(offset, !le);
            offset += 2;

            if (len === 0) {
                continue;
            }

            let pps = new Uint8Array(arrayBuffer, dataOffset + offset, len);
            offset += len;

            if (!track.pps) {
                track.pps = [pps];
            }
        }
        Log.v(this.TAG, 'Parsed AVCDecoderConfigurationRecord');
    }

    _parseAVCVideoData(arrayBuffer, dataOffset, dataSize, dts, cts) {
        let le = this._littleEndian;
        let v = new DataView(arrayBuffer, dataOffset, dataSize);

        let units = [], length = 0;

        let offset = 0;
        const lengthSize = this._naluLengthSize;

        while (offset < dataSize) {
            let naluSize = v.getUint32(offset, !le);  // Big-Endian read
            if (lengthSize === 3) {
                naluSize >>>= 8;
            }
            if (naluSize > dataSize - lengthSize) {
                Log.w(`Malformed Nalus near timestamp ${dts}, NaluSize > DataSize!`);
                return;
            }

            let unitType = v.getUint8(offset + lengthSize) & 0x1F;
            let debugString;

            switch (unitType) {
                case 1:
                    debugString = 'NDR';
                    break;
                case 5:
                    debugString = 'IDR';
                    break;
                case 6:
                    debugString = 'SEI';
                    break;
                case 7:
                    debugString = 'SPS';
                    break;
                case 8:
                    debugString = 'PPS';
                    break;
                case 9:
                    debugString = 'AUD';
                    break;
                default:
                    debugString = 'Unknown';
                    break;
            }
            Log.v(this.TAG, `${debugString}, dts = ${dts}`);

            let data = new Uint8Array(arrayBuffer, dataOffset + offset, lengthSize + naluSize);
            let unit = {type: unitType, data: data};
            units.push(unit);
            length += data.byteLength;

            offset += lengthSize + naluSize;
        }

        if (units.length) {
            let track = this._videoTrack;
            let avcSample = {units: units, length: length, dts: dts * 90, pts: (dts + cts) * 90};
            track.samples.push(avcSample);
            track.length += length;
            track.nbNalu += units.length;
        }
    }

}

export default FlvDemuxer;