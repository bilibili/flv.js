class MP4Remuxer {

    constructor() {
        this._onFragGenerated = null;
    }

    bindDataSource(producer) {
        producer.onDataAvailable = this.Remux.bind(this);
        return this;
    }

    get onFragGenerated() {
        return this._onFragGenerated;
    }

    set onFragGenerated(callback) {
        if (typeof callback !== 'function') {
            throw 'onFragGenerated must be a callback function!';
        }

        this._onFragGenerated = callback;
    }

    Remux(data) {

    }

}

export default MP4Remuxer;