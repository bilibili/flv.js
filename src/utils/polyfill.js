class Polyfill {

    static install() {
        // ES6 Object.setPrototypeOf
        Object.setPrototypeOf = Object.setPrototypeOf || function (obj, proto) {
            obj.__proto__ = proto;
            return obj;
        };
        
        // ES6 Promise (missing support in IE11)
        if (typeof self.Promise !== 'function') {
            require('es6-promise').polyfill();
        }
    }

}

export default Polyfill;