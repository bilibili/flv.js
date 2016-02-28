class Log {

    static e(tag, msg) {
        if (!Log.ENABLE_ERROR) {
            return;
        }

        if (!tag || Log.FORCE_GLOBAL_TAG)
            tag = Log.GLOBAL_TAG;

        let str = `[${tag}] > ${msg}`;

        if (console.error) {
            console.error(str);
        } else if (console.warn) {
            console.warn(str);
        } else {
            console.log(str);
        }
    }

    static i(tag, msg) {
        if (!Log.ENABLE_INFO) {
            return;
        }

        if (!tag || Log.FORCE_GLOBAL_TAG)
            tag = Log.GLOBAL_TAG;

        let str = `[${tag}] > ${msg}`;

        if (console.info) {
            console.info(str);
        } else {
            console.log(str);
        }
    }

    static w(tag, msg) {
        if (!Log.ENABLE_WARN) {
            return;
        }

        if (!tag || Log.FORCE_GLOBAL_TAG)
            tag = Log.GLOBAL_TAG;

        let str = `[${tag}] > ${msg}`;

        if (console.warn) {
            console.warn(str);
        } else {
            console.log(str);
        }
    }

    static d(tag, msg) {
        if (!Log.ENABLE_DEBUG) {
            return;
        }

        if (!tag || Log.FORCE_GLOBAL_TAG)
            tag = Log.GLOBAL_TAG;

        let str = `[${tag}] > ${msg}`;

        if (console.debug) {
            console.debug(str);
        } else {
            console.log(str);
        }
    }

    static v(tag, msg) {
        if (!Log.ENABLE_VERBOSE) {
            return;
        }

        if (!tag || Log.FORCE_GLOBAL_TAG)
            tag = Log.GLOBAL_TAG;

        console.log(`[${tag}] > ${msg}`);
    }

}

Log.GLOBAL_TAG = 'flv.js';
Log.FORCE_GLOBAL_TAG = false;
Log.ENABLE_ERROR = true;
Log.ENABLE_INFO = true;
Log.ENABLE_WARN = true;
Log.ENABLE_DEBUG = true;
Log.ENABLE_VERBOSE = true;

export default Log;