// Utility class to calculate realtime network I/O speed

class SpeedCalculator {

    constructor() {
        // milliseconds
        this._firstCheckpoint = 0;
        this._lastCheckpoint = 0;
        this._intervalBytes = 0;
        this._totalBytes = 0;
        this._lastSecondBytes = 0;

        // compatibility detection
        if (self.performance && self.performance.now) {
            this._now = self.performance.now.bind(self.performance);
        } else {
            this._now = Date.now;
        }
    }

    reset() {
        this._firstCheckpoint = this._lastCheckpoint = 0;
        this._totalBytes = this._intervalBytes = 0;
        this._lastSecondBytes = 0;
    }

    addBytes(bytes) {
        if (this._firstCheckpoint === 0) {
            this._firstCheckpoint = this._now();
            this._lastCheckpoint = this._firstCheckpoint;
            this._intervalBytes += bytes;
            this._totalBytes += bytes;
        } else if (this._now() - this._lastCheckpoint < 1000) {
            this._intervalBytes += bytes;
            this._totalBytes += bytes;
        } else {  // duration >= 1000
            this._lastSecondBytes = this._intervalBytes;
            this._intervalBytes = bytes;
            this._totalBytes += bytes;
            this._lastCheckpoint = this._now();
        }
    }

    get currentKBps() {
        let durationSeconds = (this._now() - this._lastCheckpoint) / 1000;
        return (this._intervalBytes / durationSeconds) / 1024;
    }

    get lastSecondKBps() {
        return this._lastSecondBytes / 1024;
    }

    get averageKBps() {
        let durationSeconds = (this._now() - this._firstCheckpoint) / 1000;
        return (this._totalBytes / durationSeconds) / 1024;
    }

}

export default SpeedCalculator;