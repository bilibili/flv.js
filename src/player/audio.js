const BUFFER_SIZE = 4096;
const SAMPLE_RATE = 8000;

export class AudioPlayer {
    constructor(mediaElement) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)({'sampleRate': SAMPLE_RATE, 'latencyHint': 'interactive'});
        this.requires_upsample = this.ctx.sampleRate != SAMPLE_RATE;
        this.gain = this.ctx.createGain();
        this.gain.connect(this.ctx.destination);

        let player = this;
        this.ctx.onstatechange = function (target) {
            player.play(0);
        };

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
        this.rate = 1.0;

    }

    destroy() {
        this.gain.disconnect();
        this.ctx.close();
        this.ctx = null;
    }

    play(time) {
        this.seekTime = time;
        if (this.playing)
            return;

        this.timeBase = this.ctx.currentTime;

        this.playing = true;

        let keys = Object.keys(this.buffers);
        keys.sort(function (a, b) { return a - b; });
        let nextTime = 0;
        for (let x = 0; x < keys.length; x++) {
            let ts_key = keys[x];
            let timestamp = ts_key / 1000.0;
            if (timestamp < time) {
                continue;
            }

            let buf = this.buffers[ts_key]['buffer'];
            nextTime = timestamp + this.timeBase - this.seekTime;
            this.bufSource = this.ctx.createBufferSource();
            this.bufSource.buffer = buf;
            this.bufSource.connect(this.gain);
            this.bufSource.playbackRate.value = this.rate;
            this.bufSource.start(nextTime);
        }

    }

    rateChanged(videoElement) {
        if (videoElement.rate === 1.0 && !videoElement.muted) {
            this.gain.gain.setValueAtTime(1, this.ctx.currentTime);
        } else {
            this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
        }
    }

    volumeChanged(videoElement) {
        if (!videoElement.muted && !videoElement.paused) {
            if (this.ctx.state === 'suspended') {
                this.initPlayback(videoElement);
                return;
            }
        }
        if (videoElement.muted != this.isMuted())
            this.setGain(videoElement);
    }

    onSeek(videoElement) {

    }

    isMuted() {
        return this.ctx.state === 'suspended' || this.gain.gain.value == 0;
    }

    setGain(videoElement) {
        if (videoElement.muted) {
            this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
        } else {
            this.gain.gain.setValueAtTime(1, this.ctx.currentTime);
        }
    }

    initPlayback(videoElement) {
        this.ctx.suspend();
        this.ctx.close();
        this.playing = false;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)({
            'sampleRate': SAMPLE_RATE,
            'latencyHint': 'interactive'
        });
        this.gain = this.ctx.createGain();
        this.gain.connect(this.ctx.destination);
        this.setGain(videoElement);
        this.play(videoElement.currentTime);
        this.ctx.resume();
    }

    playStateChanged(videoElement) {

        if (!videoElement.paused) {
            this.initPlayback(videoElement);
        } else {
            this.ctx.suspend();
        }
    }

    onProgressChanged(videoElement) {
        let buffered = videoElement.buffered;
    }

    enqueue(packet, timestamp) {
        if (!this.ctx)
            return;

        this.packets.push(packet);
        this.timestamps.push(timestamp);
        let total = 0;
        for (let i = 0; i < this.packets.length; i++) {
            total += this.packets[i].length;
        }

        if (total < BUFFER_SIZE) {
            return;
        }

        let buf = null;

        if (this.requires_upsample) {

            buf = this.ctx.createBuffer(1, total * 4, SAMPLE_RATE * 4);
            let channel = buf.getChannelData(0);

            timestamp = this.timestamps[0];
            let offset = 0;
            for (let i = 0; i < this.packets.length; i++) {
                let pack = this.packets[i];

                let frames = new Float32Array(pack);
                for (let x = 0; x < frames.length; x++) {
                    channel[x * 4 + offset] = frames[x];
                    channel[x * 4 + 1 + offset] = frames[x];
                    channel[x * 4 + 2 + offset] = frames[x];
                    channel[x * 4 + 3 + offset] = frames[x];
                }
                offset += frames.length * 4;
            }
        } else {
            buf = this.ctx.createBuffer(1, total, SAMPLE_RATE);
            let channel = buf.getChannelData(0);

            timestamp = this.timestamps[0];
            let offset = 0;
            for (let i = 0; i < this.packets.length; i++) {
                let pack = this.packets[i];

                let frames = new Float32Array(pack);
                for (let x = 0; x < frames.length; x++) {
                    channel[x + offset] = frames[x];
                }
                offset += frames.length;
            }
        }
        this.buffers[timestamp] = {'ts': timestamp, 'buffer': buf};

        if (this.playing) {
            if (this.timeBase == 0)
                this.timeBase = this.ctx.currentTime;

            let nextTime = (timestamp / 1000.0) + this.timeBase - this.seekTime;
            this.bufSource = this.ctx.createBufferSource();
            this.bufSource.buffer = buf;
            this.bufSource.playbackRate.value = this.rate;
            this.bufSource.connect(this.gain);
            this.bufSource.start(nextTime);
        }

        this.packets = [];
        this.timestamps = [];
    }
}