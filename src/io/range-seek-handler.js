class RangeSeekHandler {

    constructor() {

    }

    getConfig(url, range) {
        let headers = {};

        if (range.from !== 0 || range.to !== -1) {
            let param;
            if (range.to !== -1) {
                param = `bytes=${range.from.toString()}-${range.to.toString()}`;
            } else {
                param = `bytes=${range.from.toString()}-`;
            }
            headers['Range'] = param;
        }

        return {
            url: url,
            headers: headers
        };
    }

}

export default RangeSeekHandler;