import MediaInfo from './media-info.js';
import FlvDemuxer from '../demux/flv-demuxer.js';
import MP4Remuxer from '../remux/mp4-remuxer.js';
import IOController from '../io/io-controller.js';

// Manage IO, Demuxing, and Remuxing. Especially demuxer and remuxer.
class RemuxingController {

    constructor(url) {
        this._ioctl = new IOController(url);
        this._ioctl.onDataArrival = this._onInitChunkArrival.bind(this);
    }

    seekTo(milliseconds) {
        // Get bytes position from MediaInfo.KeyframesTable
        // this._ioctl.seek(bytes);
    }

    // throw from IOController
    _onInitChunkArrival(data) {
        // TODO: if (FlvDemuxer.probe(data)) this._demuxer = new FlvDemuxer(probeData);
        // TODO:
        // this._demuxer.bindDataSource(this._ioctl);
        // this._remuxer = new MP4Remuxer();
        // this._remuxer.bindDataSource(this._demuxer);
        let probeData = null;
        if ((probeData = FlvDemuxer.probe(data)).match) {
            // create FlvDemuxer
            this._demuxer = new FlvDemuxer(probeData);
            this._remuxer = new MP4Remuxer();

            this._remuxer.bindDataSource(this._demuxer
                         .bindDataSource(this._ioctl
            ));
        } //else {
            // non-flv, throw exception or trigger event
        //}
    }

}

export default RemuxingController;