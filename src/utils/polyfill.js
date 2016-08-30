class Polyfill {

    static install() {
        // ES6 Object.setPrototypeOf
        Object.setPrototypeOf = Object.setPrototypeOf || function (obj, proto) {
            obj.__proto__ = proto;
            return obj;
        };

        // ES6 Object.assign
        Object.assign = Object.assign || function (target) {
            if (target === undefined || target === null) {
                throw new TypeError('Cannot convert undefined or null to object');
            }

            let output = Object(target);
            for (let i = 1; i < arguments.length; i++) {
                let source = arguments[i];
                if (source !== undefined && source !== null) {
                    for (let key in source) {
                        if (source.hasOwnProperty(key)) {
                            output[key] = source[key];
                        }
                    }
                }
            }
            return output;
        };

        // ES6 Promise (missing support in IE11)
        if (typeof self.Promise !== 'function') {
            // polyfill() will be called internally during module load
            require('es6-promise');
        }
    }

}

Polyfill.install();

export default Polyfill;