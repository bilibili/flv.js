
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

    static probe(buffer) {
        let data = new Uint8Array(buffer);

        if (data[0] !== 0x46 || data[1] !== 0x4C || data[2] !== 0x56 || data[3] !== 0x01) {
            return {match: false};
        }

        if ((data[4] >>> 3) !== 0 || (data[4] & 2) !== 0) {  // two reserved flags
            return {match: false};
        }

        let hasAudio = ((data[4] & 4) >>> 2) !== 0;
        let hasVideo = (data[4] & 1) !== 0;

        if (!hasAudio && !hasVideo) {
            return {match: false};
        }

        let offset = ReadBig32(data, 5);

        if (offset < 9) {
            return {match: false};
        }

        return {
            match: true,
            hasAudioTrack: hasAudio,
            hasVideoTrack: hasVideo,
            dataOffset: offset
        };
    }

    constructor() {
        this._onDataAvailable = null;
    }

    bindDataSource(loader) {
        loader.onDataArrival = this.ParseChunks.bind(this);
        return this;
    }

    get onDataAvailable() {
        return this._onDataAvailable;
    }

    set onDataAvailable(callback) {
        if (typeof callback !== 'function') {
            throw 'onDataAvailable must be a callback function!';
        }

        this._onDataAvailable = callback;
    }

    ParseChunks(chunk, byteStart, receivedLength) {

        if (this._onDataAvailable) {
            this._onDataAvailable();
        }
    }

}

export default FlvDemuxer;