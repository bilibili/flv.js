const BUFFER_SIZE = 4096
const SAMPLE_RATE = 8000

export class AudioPlayer {
    constructor(mediaElement) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)({'sampleRate':SAMPLE_RATE, 'latencyHint':'interactive'});

        let player = this;
        this.ctx.onstatechange = function(target) {
            player.play(0);
        }

        this.time_base = 0;

        this.offset = 0;
        this.bufSource = null;
        this.channel = null;
        this.ready = false;
        this.buffers = {};
        this.videoPlayer = mediaElement;
        this.packets = [];
        this.timestamps = [];
        this.seekTime = 0;
    }

    play(time) {
        this.seekTime = time;
        if (this.playing)
            return;

        this.timeBase = this.ctx.currentTime;

        this.playing = true

        let keys = Object.keys(this.buffers);
        keys.sort(function (a, b) { return a-b; });
        let nextTime = 0;
        for (let x = 0; x<keys.length; x++) {
            let ts_key = keys[x];
            let timestamp = ts_key / 1000.0;
            if (timestamp < time) {
                continue;
            }

            let buf = this.buffers[ts_key]['buffer'];
            let nextTime = timestamp + this.timeBase - this.seekTime;
            this.bufSource = this.ctx.createBufferSource();
            this.bufSource.buffer = buf;
            this.bufSource.connect(this.ctx.destination);
            this.bufSource.start(nextTime);
        }

    }

    onSeek(videoElement) {


    }

    playStateChanged(videoElement) {

        if (!videoElement.paused) {
            this.ctx.suspend();
            this.ctx.close();
            this.playing = false;
            this.ctx = new (window.AudioContext || window.webkitAudioContext)({
                'sampleRate': SAMPLE_RATE,
                'latencyHint': 'interactive'
            });
            this.play(videoElement.currentTime);
            this.ctx.resume();
        } else {
            this.ctx.suspend();
        }
    }

    enqueue(packet, timestamp) {
        this.packets.push(packet);
        this.timestamps.push(timestamp);
        let total = 0;
        for (let i=0; i<this.packets.length; i++) {
            total += this.packets[i].length;
        }

        if (total < BUFFER_SIZE) {
            return;
        }



        let buf = this.ctx.createBuffer(1, total, SAMPLE_RATE);
        let channel = buf.getChannelData(0);

        timestamp = this.timestamps[0];
        let offset = 0;
        for (let i=0; i<this.packets.length; i++) {
            let pack = this.packets[i];

            let frames = new Float32Array(pack)
            for (let x = 0; x < frames.length; x++) {
                channel[x+offset] = frames[x];
            }
            offset+=frames.length;
        }
        this.buffers[timestamp] = {'ts': timestamp, 'buffer': buf};

        if (this.playing) {
            if (this.timeBase ==0)
                this.timeBase = this.ctx.currentTime;

            let nextTime = timestamp + this.timeBase - this.seekTime;
            this.bufSource = this.ctx.createBufferSource();
            this.bufSource.buffer = buf;
            this.bufSource.connect(this.ctx.destination);
            this.bufSource.start(nextTime);
        }

        this.packets = [];
        this.timestamps = [];
    }

    destroy() {
    }
}