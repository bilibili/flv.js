/*
 * Copyright (C) 2016 Bilibili. All Rights Reserved.
 *
 * @author zheng qian <xqq@xqq.im>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
            require('es6-promise').polyfill();
        }
    }

}

Polyfill.install();

export default Polyfill;